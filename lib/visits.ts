import type { Client } from "@libsql/client";
import { bookableDates, isPast, type Result } from "./booking";
import { activityFor, slotsFor, SLOT_MINUTES, toMinutes, type ClubConfig } from "./config";
import type { ClubNow } from "./time";

// Walk-around areas (the 15-station clays course) are never booked and never "full".
// Instead we estimate how many people are on the course:
//   - Check-ins: recorded by staff at the desk, either a member's planned visit or a walk-in group.
//     Each check-in counts as "on the course" for one round (roundMinutes, default 2 hours).
//   - Expected visitors: members who tapped "Planning to come?". Non-binding, no limit.
//     They count only for times still ahead; a planned visit that never checked in drops off.

export type Visit = {
  id: number;
  activity: string;
  user_id: number | null;
  date: string;
  time: string;
  party_size: number;
  kind: "expected" | "checked_in" | "cancelled";
  source: "app" | "desk";
  member_name?: string | null;
  member_no?: string | null;
};

export const MAX_VISIT_PARTY = 12;

type Cfg = Pick<ClubConfig, "activities" | "hours" | "bookingDays" | "roundMinutes">;

function walkaround(cfg: Pick<ClubConfig, "activities">, activity: string) {
  const a = activityFor(cfg, activity);
  return a && a.active && a.mode === "walkaround" ? a : null;
}

/** Member: "I'm planning to come at 10:00 with 3 people." */
export async function planVisit(
  db: Client,
  cfg: Cfg,
  v: { userId: number; activity: string; date: string; time: string; partySize: number },
  now: ClubNow,
): Promise<Result<{ id: number }>> {
  const a = walkaround(cfg, v.activity);
  if (!a) return { ok: false, error: "That area isn't a walk-around course." };
  if (!bookableDates(cfg, now).includes(v.date)) return { ok: false, error: `You can plan visits up to ${cfg.bookingDays} days ahead.` };
  const slots = slotsFor(cfg, v.date);
  if (!slots.length) return { ok: false, error: "The club is closed that day." };
  if (!slots.includes(v.time)) return { ok: false, error: "Pick a time while the club is open." };
  if (isPast(v.date, v.time, now)) return { ok: false, error: "That time has passed. Pick a later time." };
  if (!Number.isInteger(v.partySize) || v.partySize < 1 || v.partySize > MAX_VISIT_PARTY)
    return { ok: false, error: `Party size is 1 to ${MAX_VISIT_PARTY}. For a bigger group, call the front desk.` };
  const dup = await db.execute({
    sql: "SELECT 1 FROM visits WHERE user_id = ? AND activity = ? AND date = ? AND kind = 'expected'",
    args: [v.userId, v.activity, v.date],
  });
  if (dup.rows.length) return { ok: false, error: `You already have a planned ${a.label.toLowerCase()} visit that day. Cancel it first to change the time.` };
  const rs = await db.execute({
    sql: "INSERT INTO visits (activity,user_id,date,time,party_size,kind,source) VALUES (?,?,?,?,?,'expected','app')",
    args: [v.activity, v.userId, v.date, v.time, v.partySize],
  });
  return { ok: true, id: Number(rs.lastInsertRowid) };
}

export async function cancelVisit(db: Client, id: number, userId: number): Promise<Result> {
  const rs = await db.execute({
    sql: "UPDATE visits SET kind = 'cancelled' WHERE id = ? AND user_id = ? AND kind = 'expected'",
    args: [id, userId],
  });
  return rs.rowsAffected ? { ok: true } : { ok: false, error: "That planned visit can't be cancelled (it may already be checked in)." };
}

/** Staff: check in a member's planned visit, from the time they actually arrive. */
export async function checkInVisit(db: Client, id: number, now: ClubNow): Promise<Result> {
  const rs = await db.execute({
    sql: "UPDATE visits SET kind = 'checked_in', time = ? WHERE id = ? AND kind = 'expected' AND date = ?",
    args: [now.time, id, now.date],
  });
  return rs.rowsAffected ? { ok: true } : { ok: false, error: "Only today's planned visits can be checked in." };
}

/** Staff: a group walked up without planning ahead. */
export async function recordWalkIn(db: Client, cfg: Pick<ClubConfig, "activities">, activity: string, partySize: number, now: ClubNow): Promise<Result<{ id: number }>> {
  if (!walkaround(cfg, activity)) return { ok: false, error: "That area isn't a walk-around course." };
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > 50) return { ok: false, error: "Enter how many people (1 to 50)." };
  const rs = await db.execute({
    sql: "INSERT INTO visits (activity,user_id,date,time,party_size,kind,source) VALUES (?,NULL,?,?,?,'checked_in','desk')",
    args: [activity, now.date, now.time, partySize],
  });
  return { ok: true, id: Number(rs.lastInsertRowid) };
}

/** Staff: undo a check-in made by mistake (walk-ins are removed, planned visits go back to expected). */
export async function undoCheckIn(db: Client, id: number): Promise<Result> {
  const rs = await db.execute({
    sql: `UPDATE visits SET kind = CASE WHEN user_id IS NULL THEN 'cancelled' ELSE 'expected' END
          WHERE id = ? AND kind = 'checked_in'`,
    args: [id],
  });
  return rs.rowsAffected ? { ok: true } : { ok: false, error: "Nothing to undo." };
}

export async function visitsOn(db: Client, date: string, activity?: string): Promise<Visit[]> {
  const rs = await db.execute({
    sql: `SELECT v.*, u.name AS member_name, u.member_no FROM visits v LEFT JOIN users u ON u.id = v.user_id
          WHERE v.date = ? AND v.kind != 'cancelled' ${activity ? "AND v.activity = ?" : ""} ORDER BY v.time, v.id`,
    args: activity ? [date, activity] : [date],
  });
  return rs.rows as unknown as Visit[];
}

export async function memberVisits(db: Client, userId: number, now: ClubNow): Promise<Visit[]> {
  const rs = await db.execute({
    sql: "SELECT * FROM visits WHERE user_id = ? AND kind = 'expected' AND date >= ? ORDER BY date, time",
    args: [userId, now.date],
  });
  return (rs.rows as unknown as Visit[]).filter((v) => !isPast(v.date, v.time, now) || v.date === now.date);
}

/**
 * Estimated people on a walk-around course at each slot of a day.
 * A visit covers the slots from its time until one round later.
 */
export async function peopleOnCourse(db: Client, cfg: Pick<ClubConfig, "hours" | "roundMinutes">, activity: string, date: string, now: ClubNow) {
  const slots = slotsFor(cfg, date);
  const visits = await visitsOn(db, date, activity);
  return slots.map((time) => {
    const t = toMinutes(time);
    const ahead = !isPast(date, time, now) || (date === now.date && toMinutes(now.time) - t < SLOT_MINUTES); // the current slot counts as ahead
    let people = 0;
    for (const v of visits) {
      if (v.kind === "expected" && !ahead) continue; // planned but never checked in: don't count
      const start = toMinutes(v.time);
      if (t + SLOT_MINUTES > start && t < start + cfg.roundMinutes) people += Number(v.party_size);
    }
    return { time, people };
  });
}
