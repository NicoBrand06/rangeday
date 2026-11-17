import type { Client } from "@libsql/client";
import { activityFor, slotsFor, type ActivityMode, type ClubConfig } from "./config";
import { addDays, type ClubNow } from "./time";

// Booking rules live here, separate from the screens, so they can be tested on their own.
// Every function takes the database, the club's settings and "now" as inputs, which lets
// tests set any rules, date or time they like.
//
// Each area has a booking type (set in club settings):
//   slot       - a field to yourself for the slot. One party per field per slot. (5-Stand, trap, skeet)
//   shared     - bookable, but shared with others, up to perSlot people per slot. (flat range, pond, archery)
//   walkaround - not booked at all and never "full" (the clays course). See lib/visits.ts.

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export type Station = { id: number; activity: string; name: string; capacity: number; active?: number };

export type Crowd = "quiet" | "moderate" | "busy";

export type SlotView = {
  time: string;
  free: Station[]; // stations (or the shared area) still bookable at this time
  total: number;
  status: "open" | "few" | "full" | "past";
  mine: boolean; // the viewer already has a booking at this time (any station)
  people: number; // people already booked here at this time (all parties)
  limit: number | null; // shared areas: most people per slot; fields: null
  spotsLeft: number | null; // shared areas: places left; fields: null
};

/** Quiet under about a third full, busy from about 70%. Shared with the busy meter. */
export function crowdFor(pct: number): Crowd {
  return pct >= 70 ? "busy" : pct >= 35 ? "moderate" : "quiet";
}

export type BookingRow = {
  id: number;
  user_id: number;
  station_id: number;
  station_name: string;
  activity: string;
  date: string;
  start_time: string;
  party_size: number;
  status: "booked" | "checked_in" | "no_show" | "cancelled";
  source: "app" | "phone";
  shared: number; // 1 = a shared area booking
};

type Rules = Pick<ClubConfig, "hours" | "activities" | "bookingDays" | "maxPerDay" | "cancelCutoff">;

const LIVE = "status != 'cancelled'";

export function bookableDates(cfg: Pick<ClubConfig, "bookingDays">, now: ClubNow): string[] {
  return Array.from({ length: cfg.bookingDays }, (_, i) => addDays(now.date, i));
}

export function isPast(date: string, time: string, now: ClubNow): boolean {
  return date < now.date || (date === now.date && time <= now.time);
}

/** Members can cancel in the app until the cut-off time (default 6 pm) the day before. */
export function cancelDeadline(cfg: Pick<ClubConfig, "cancelCutoff">, date: string): { date: string; time: string } {
  return { date: addDays(date, -1), time: cfg.cancelCutoff };
}

export function canMemberCancel(cfg: Pick<ClubConfig, "cancelCutoff">, date: string, now: ClubNow): boolean {
  const d = cancelDeadline(cfg, date);
  return now.date < d.date || (now.date === d.date && now.time < d.time);
}

/** Bookable stations for an activity. Retired stations keep their history but can't be booked. */
export async function stationsFor(db: Client, activity: string): Promise<Station[]> {
  const rs = await db.execute({
    sql: "SELECT id,activity,name,capacity FROM stations WHERE activity = ? AND active = 1 ORDER BY id",
    args: [activity],
  });
  return rs.rows as unknown as Station[];
}

/** Every slot for one activity on one day, with what's still bookable. Empty when closed. */
export async function availability(db: Client, cfg: Rules, activity: string, date: string, userId: number, now: ClubNow): Promise<SlotView[]> {
  const slots = slotsFor(cfg, date);
  const act = activityFor(cfg, activity);
  if (!slots.length || !act || !act.active || act.mode === "walkaround") return [];
  const stations = await stationsFor(db, activity);
  const taken = await db.execute({
    sql: `SELECT b.station_id, b.start_time, b.party_size FROM bookings b JOIN stations s ON s.id = b.station_id
          WHERE s.activity = ? AND b.date = ? AND b.${LIVE}`,
    args: [activity, date],
  });
  const takenSet = new Set(taken.rows.map((r) => `${r.station_id}|${r.start_time}`));
  const peopleAt = new Map<string, number>();
  for (const r of taken.rows) peopleAt.set(String(r.start_time), (peopleAt.get(String(r.start_time)) ?? 0) + Number(r.party_size));
  const mineRs = await db.execute({ sql: `SELECT start_time FROM bookings WHERE user_id = ? AND date = ? AND ${LIVE}`, args: [userId, date] });
  const mine = new Set(mineRs.rows.map((r) => String(r.start_time)));

  return slots.map((time) => {
    const people = peopleAt.get(time) ?? 0;
    const base = { time, total: stations.length, mine: mine.has(time), people, limit: null, spotsLeft: null };
    const past = isPast(date, time, now);

    if (act.mode === "shared") {
      const limit = act.perSlot ?? 1;
      const spotsLeft = Math.max(0, limit - people);
      const status = past ? "past" : spotsLeft === 0 ? "full" : spotsLeft <= 2 && people > 0 ? "few" : "open";
      return { ...base, free: spotsLeft > 0 ? stations : [], status, limit, spotsLeft };
    }
    const free = stations.filter((s) => !takenSet.has(`${s.id}|${time}`));
    let status: SlotView["status"] = "open";
    if (past) status = "past";
    else if (free.length === 0) status = "full";
    else if (free.length <= 2 && free.length < stations.length) status = "few"; // "1 left" / "2 left"
    return { ...base, free, status };
  });
}

export type NewBooking = {
  userId: number;
  stationId: number;
  date: string;
  time: string;
  partySize: number;
  source?: "app" | "phone";
};

/** Create a booking, or explain in plain words why it can't be made. All checks run on the server. */
export async function createBooking(db: Client, cfg: Rules, b: NewBooking, now: ClubNow): Promise<Result<{ id: number }>> {
  if (!bookableDates(cfg, now).includes(b.date))
    return { ok: false, error: `Bookings open ${cfg.bookingDays} days ahead. Pick a date from today onward.` };
  const slots = slotsFor(cfg, b.date);
  if (!slots.length) return { ok: false, error: "The club is closed that day." };
  if (!slots.includes(b.time)) return { ok: false, error: "That isn't one of the club's time slots that day." };
  if (isPast(b.date, b.time, now)) return { ok: false, error: "That time has already started. Pick a later slot." };

  const station = (await db.execute({ sql: "SELECT id,activity,name,capacity,active FROM stations WHERE id = ?", args: [b.stationId] }))
    .rows[0] as unknown as Station | undefined;
  const act = station && activityFor(cfg, station.activity);
  if (!station || !Number(station.active) || !act || !act.active) return { ok: false, error: "That station isn't available for booking." };
  const mode: ActivityMode = act.mode;
  if (mode === "walkaround")
    return { ok: false, error: `${act.label} is walk-around: no booking needed. Use "Planning to come?" so others know how busy it will be.` };
  const limit = mode === "shared" ? (act.perSlot ?? 1) : null;

  const maxParty = limit == null ? station.capacity : Math.min(station.capacity, limit);
  if (!Number.isInteger(b.partySize) || b.partySize < 1 || b.partySize > maxParty)
    return { ok: false, error: `${station.name} takes 1 to ${maxParty} ${maxParty === 1 ? "person" : "people"} per booking.` };

  const user = (await db.execute({ sql: "SELECT active FROM users WHERE id = ?", args: [b.userId] })).rows[0];
  if (!user || !Number(user.active)) return { ok: false, error: "That member account isn't active." };

  const sameTime = await db.execute({
    sql: `SELECT 1 FROM bookings WHERE user_id = ? AND date = ? AND start_time = ? AND ${LIVE}`,
    args: [b.userId, b.date, b.time],
  });
  if (sameTime.rows.length) return { ok: false, error: "This member already has a booking at that time." };

  const perDay = await db.execute({ sql: `SELECT count(*) AS n FROM bookings WHERE user_id = ? AND date = ? AND ${LIVE}`, args: [b.userId, b.date] });
  if (Number(perDay.rows[0].n) >= cfg.maxPerDay)
    return { ok: false, error: `Members can hold up to ${cfg.maxPerDay} bookings per day, so others get a turn.` };

  const args = [b.userId, b.stationId, b.date, b.time, b.partySize, b.source ?? "app"];

  if (mode === "shared") {
    // One statement checks the headcount and inserts together, so two members grabbing
    // the last places at the same instant can't push the area over its limit.
    const rs = await db.execute({
      sql: `INSERT INTO bookings (user_id,station_id,date,start_time,party_size,source,shared)
            SELECT ?1,?2,?3,?4,?5,?6,1
            WHERE (SELECT coalesce(sum(party_size),0) FROM bookings
                   WHERE station_id = ?2 AND date = ?3 AND start_time = ?4 AND ${LIVE}) + ?5 <= ?7`,
      args: [...args, limit],
    });
    if (rs.rowsAffected) return { ok: true, id: Number(rs.lastInsertRowid) };
    const used = await db.execute({
      sql: `SELECT coalesce(sum(party_size),0) AS n FROM bookings WHERE station_id = ? AND date = ? AND start_time = ? AND ${LIVE}`,
      args: [b.stationId, b.date, b.time],
    });
    const left = Math.max(0, (limit ?? 0) - Number(used.rows[0].n));
    return {
      ok: false,
      error: left
        ? `Only ${left} ${left === 1 ? "place is" : "places are"} left at ${station.name} then. Book for fewer people or pick another time.`
        : `${station.name} is full at that time (${limit} people). Pick another time.`,
    };
  }

  try {
    // The unique index in the database refuses a second live booking for this lane and slot,
    // so even two "Confirm" taps at the same instant can't both succeed.
    const rs = await db.execute({
      sql: "INSERT INTO bookings (user_id,station_id,date,start_time,party_size,source) VALUES (?,?,?,?,?,?)",
      args,
    });
    return { ok: true, id: Number(rs.lastInsertRowid) };
  } catch (e) {
    if (String(e).includes("UNIQUE")) return { ok: false, error: `Sorry, someone just booked ${station.name} at that time. Pick another station or slot.` };
    throw e;
  }
}

export async function getBooking(db: Client, id: number): Promise<BookingRow | null> {
  const rs = await db.execute({
    sql: `SELECT b.*, s.name AS station_name, s.activity FROM bookings b JOIN stations s ON s.id = b.station_id WHERE b.id = ?`,
    args: [id],
  });
  return (rs.rows[0] as unknown as BookingRow) ?? null;
}

/** Cancel a booking. Members: their own, until the cut-off. Staff: any upcoming booking. */
export async function cancelBooking(
  db: Client,
  cfg: Pick<ClubConfig, "cancelCutoff">,
  bookingId: number,
  actor: { id: number; role: "member" | "staff" },
  now: ClubNow,
): Promise<Result> {
  const b = await getBooking(db, bookingId);
  if (!b) return { ok: false, error: "Booking not found." };
  if (actor.role !== "staff" && b.user_id !== actor.id) return { ok: false, error: "You can only cancel your own bookings." };
  if (b.status === "cancelled") return { ok: false, error: "This booking is already cancelled." };
  if (b.status !== "booked") return { ok: false, error: "This booking has already been checked in or closed." };
  if (isPast(b.date, b.start_time, now)) return { ok: false, error: "This session has already started." };
  if (actor.role !== "staff" && !canMemberCancel(cfg, b.date, now))
    return { ok: false, error: `The free cancellation window closed at ${cfg.cancelCutoff} the day before. Please call the front desk.` };

  await db.execute({ sql: "UPDATE bookings SET status = 'cancelled' WHERE id = ? AND status = 'booked'", args: [bookingId] });
  return { ok: true };
}

export async function memberBookings(db: Client, userId: number, now: ClubNow): Promise<{ upcoming: BookingRow[]; past: BookingRow[] }> {
  const rs = await db.execute({
    sql: `SELECT b.*, s.name AS station_name, s.activity FROM bookings b JOIN stations s ON s.id = b.station_id
          WHERE b.user_id = ? ORDER BY b.date, b.start_time`,
    args: [userId],
  });
  const rows = rs.rows as unknown as BookingRow[];
  const upcoming = rows.filter((r) => r.status === "booked" && !isPast(r.date, r.start_time, now));
  const past = rows.filter((r) => !upcoming.includes(r)).reverse();
  return { upcoming, past };
}
