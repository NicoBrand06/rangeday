import type { Client } from "@libsql/client";
import type { Result } from "./booking";
import type { ClubNow } from "./time";

export type EventRow = {
  id: number;
  title: string;
  category: string;
  description: string;
  date: string;
  start_time: string;
  end_time: string;
  location: string;
  capacity: number;
  cancelled: number;
  going: number; // RSVPs so far
  mine: number; // 1 if the viewer has RSVP'd
};

const SELECT = `SELECT e.*,
  (SELECT count(*) FROM rsvps r WHERE r.event_id = e.id) AS going,
  (SELECT count(*) FROM rsvps r WHERE r.event_id = e.id AND r.user_id = ?) AS mine
  FROM events e`;

export function hasStarted(e: Pick<EventRow, "date" | "start_time">, now: ClubNow) {
  return e.date < now.date || (e.date === now.date && e.start_time <= now.time);
}

export function spotsLeft(e: EventRow) {
  return Math.max(0, e.capacity - e.going);
}

/** Events that haven't started yet, soonest first. */
export async function upcomingEvents(db: Client, userId: number, now: ClubNow): Promise<EventRow[]> {
  const rs = await db.execute({
    sql: `${SELECT} WHERE (e.date > ? OR (e.date = ? AND e.start_time > ?)) ORDER BY e.date, e.start_time`,
    args: [userId, now.date, now.date, now.time],
  });
  return rs.rows as unknown as EventRow[];
}

export async function getEvent(db: Client, id: number, userId: number): Promise<EventRow | null> {
  const rs = await db.execute({ sql: `${SELECT} WHERE e.id = ?`, args: [userId, id] });
  return (rs.rows[0] as unknown as EventRow) ?? null;
}

export async function rsvp(db: Client, eventId: number, userId: number, now: ClubNow): Promise<Result> {
  const e = await getEvent(db, eventId, userId);
  if (!e) return { ok: false, error: "Event not found." };
  if (e.cancelled) return { ok: false, error: "This event has been cancelled." };
  if (hasStarted(e, now)) return { ok: false, error: "This event has already started." };
  if (e.mine) return { ok: false, error: "You're already on the list." };

  // One statement that only inserts if there is still room, so two members
  // can't both take the last spot.
  const rs = await db.execute({
    sql: `INSERT INTO rsvps (event_id, user_id)
          SELECT ?, ? WHERE (SELECT count(*) FROM rsvps WHERE event_id = ?) < (SELECT capacity FROM events WHERE id = ?)`,
    args: [eventId, userId, eventId, eventId],
  });
  if (rs.rowsAffected === 0) return { ok: false, error: "Sorry, this event is full." };
  return { ok: true };
}

export async function cancelRsvp(db: Client, eventId: number, userId: number, now: ClubNow): Promise<Result> {
  const e = await getEvent(db, eventId, userId);
  if (!e || !e.mine) return { ok: false, error: "You're not on the list for this event." };
  if (hasStarted(e, now)) return { ok: false, error: "This event has already started." };
  await db.execute({ sql: "DELETE FROM rsvps WHERE event_id = ? AND user_id = ?", args: [eventId, userId] });
  return { ok: true };
}
