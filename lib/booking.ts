import type { Client } from "@libsql/client";
import { POLICY, SLOTS } from "./club";
import { addDays, type ClubNow } from "./time";

// Booking rules live here, separate from the screens, so they can be tested on their own.
// Every function takes the database and "now" as inputs, which lets tests pretend
// it is any date or time they like.

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export type Station = { id: number; activity: string; name: string; capacity: number };

export type SlotView = {
  time: string;
  free: Station[]; // stations still open at this time
  total: number;
  status: "open" | "few" | "full" | "past";
  mine: boolean; // the viewer already has a booking at this time (any station)
};

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
};

const LIVE = "status != 'cancelled'";

export function bookableDates(now: ClubNow): string[] {
  return Array.from({ length: POLICY.daysAhead }, (_, i) => addDays(now.date, i));
}

export function isPast(date: string, time: string, now: ClubNow): boolean {
  return date < now.date || (date === now.date && time <= now.time);
}

/** Members can cancel in the app until 6 pm the day before the booking. */
export function cancelDeadline(date: string): { date: string; time: string } {
  return { date: addDays(date, -1), time: POLICY.cancelCutoffTime };
}

export function canMemberCancel(date: string, now: ClubNow): boolean {
  const d = cancelDeadline(date);
  return now.date < d.date || (now.date === d.date && now.time < d.time);
}

export async function stationsFor(db: Client, activity: string): Promise<Station[]> {
  const rs = await db.execute({ sql: "SELECT id,activity,name,capacity FROM stations WHERE activity = ? ORDER BY id", args: [activity] });
  return rs.rows as unknown as Station[];
}

/** Every slot for one activity on one day, with which stations are still free. */
export async function availability(db: Client, activity: string, date: string, userId: number, now: ClubNow): Promise<SlotView[]> {
  const stations = await stationsFor(db, activity);
  const taken = await db.execute({
    sql: `SELECT b.station_id, b.start_time FROM bookings b JOIN stations s ON s.id = b.station_id
          WHERE s.activity = ? AND b.date = ? AND b.${LIVE}`,
    args: [activity, date],
  });
  const takenSet = new Set(taken.rows.map((r) => `${r.station_id}|${r.start_time}`));
  const mineRs = await db.execute({
    sql: `SELECT start_time FROM bookings WHERE user_id = ? AND date = ? AND ${LIVE}`,
    args: [userId, date],
  });
  const mine = new Set(mineRs.rows.map((r) => String(r.start_time)));

  return SLOTS.map((time) => {
    const free = stations.filter((s) => !takenSet.has(`${s.id}|${time}`));
    let status: SlotView["status"] = "open";
    if (isPast(date, time, now)) status = "past";
    else if (free.length === 0) status = "full";
    else if (free.length <= 2 && free.length < stations.length) status = "few"; // "1 left" / "2 left"
    return { time, free, total: stations.length, status, mine: mine.has(time) };
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

/** Create a booking, or explain in plain words why it can't be made. */
export async function createBooking(db: Client, b: NewBooking, now: ClubNow): Promise<Result<{ id: number }>> {
  if (!SLOTS.includes(b.time)) return { ok: false, error: "That isn't one of the club's time slots." };
  if (!bookableDates(now).includes(b.date))
    return { ok: false, error: `Bookings open ${POLICY.daysAhead} days ahead. Pick a date from today onward.` };
  if (isPast(b.date, b.time, now)) return { ok: false, error: "That time has already started. Pick a later slot." };

  const station = (await db.execute({ sql: "SELECT id,activity,name,capacity FROM stations WHERE id = ?", args: [b.stationId] }))
    .rows[0] as unknown as Station | undefined;
  if (!station) return { ok: false, error: "That station doesn't exist." };

  if (!Number.isInteger(b.partySize) || b.partySize < POLICY.minParty || b.partySize > station.capacity)
    return { ok: false, error: `${station.name} takes 1 to ${station.capacity} shooters.` };

  const sameTime = await db.execute({
    sql: `SELECT 1 FROM bookings WHERE user_id = ? AND date = ? AND start_time = ? AND ${LIVE}`,
    args: [b.userId, b.date, b.time],
  });
  if (sameTime.rows.length) return { ok: false, error: "This member already has a booking at that time." };

  const perDay = await db.execute({
    sql: `SELECT count(*) AS n FROM bookings WHERE user_id = ? AND date = ? AND ${LIVE}`,
    args: [b.userId, b.date],
  });
  if (Number(perDay.rows[0].n) >= POLICY.maxBookingsPerMemberPerDay)
    return { ok: false, error: `Members can hold up to ${POLICY.maxBookingsPerMemberPerDay} bookings per day, so others get a turn.` };

  try {
    // The unique index in the database refuses a second live booking for this station and slot,
    // so even two "Confirm" taps at the same instant can't both succeed.
    const rs = await db.execute({
      sql: "INSERT INTO bookings (user_id,station_id,date,start_time,party_size,source) VALUES (?,?,?,?,?,?)",
      args: [b.userId, b.stationId, b.date, b.time, b.partySize, b.source ?? "app"],
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
  if (actor.role !== "staff" && !canMemberCancel(b.date, now))
    return { ok: false, error: "The free cancellation window closed at 6 pm the day before. Please call the front desk." };

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
