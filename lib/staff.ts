import type { Client } from "@libsql/client";
import type { BookingRow, Result } from "./booking";
import { getBooking } from "./booking";
import { SLOTS } from "./club";
import type { ClubNow } from "./time";

// Rules for the front desk console (F11 in the case study).

export type DeskBooking = BookingRow & { member_name: string; member_no: string };

export async function bookingsOn(db: Client, date: string): Promise<DeskBooking[]> {
  const rs = await db.execute({
    sql: `SELECT b.*, s.name AS station_name, s.activity, u.name AS member_name, u.member_no
          FROM bookings b JOIN stations s ON s.id = b.station_id JOIN users u ON u.id = b.user_id
          WHERE b.date = ? ORDER BY b.start_time, b.station_id`,
    args: [date],
  });
  return rs.rows as unknown as DeskBooking[];
}

export async function members(db: Client) {
  const rs = await db.execute("SELECT id, name, member_no FROM users WHERE role = 'member' ORDER BY name");
  return rs.rows as unknown as { id: number; name: string; member_no: string }[];
}

/**
 * Check-in and no-show tracking: this is what finally lets the club measure no-shows.
 * - Check in: only on the day of the booking (members can arrive a bit early).
 * - No-show: only once the slot has started.
 * - Undo: puts a checked-in or no-show booking back to "booked", for mis-taps.
 */
export async function setAttendance(db: Client, id: number, to: "checked_in" | "no_show" | "booked", now: ClubNow): Promise<Result> {
  const b = await getBooking(db, id);
  if (!b) return { ok: false, error: "Booking not found." };
  if (b.status === "cancelled") return { ok: false, error: "This booking was cancelled." };
  if (b.date !== now.date) return { ok: false, error: "Check-ins are recorded on the day of the booking." };
  if (to === "no_show" && b.start_time > now.time) return { ok: false, error: "You can mark a no-show once the slot has started." };
  if (to === "booked" && b.status === "booked") return { ok: false, error: "Nothing to undo." };
  if (to !== "booked" && b.status !== "booked") return { ok: false, error: "Already recorded. Use Undo first." };
  await db.execute({ sql: "UPDATE bookings SET status = ? WHERE id = ?", args: [to, id] });
  return { ok: true };
}

export type EventInput = {
  title: string;
  category: string;
  description: string;
  date: string;
  start_time: string;
  end_time: string;
  location: string;
  capacity: number;
};

export const EVENT_CATEGORIES = ["Clinic", "League", "Social", "Tournament"];

function validateEvent(e: EventInput, now: ClubNow): string | null {
  if (!e.title.trim()) return "Give the event a title.";
  if (!EVENT_CATEGORIES.includes(e.category)) return "Pick a category.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) return "Pick a date.";
  if (e.date < now.date) return "The date is in the past.";
  if (!/^\d{2}:\d{2}$/.test(e.start_time) || !/^\d{2}:\d{2}$/.test(e.end_time)) return "Set a start and end time.";
  if (e.end_time <= e.start_time) return "The end time must be after the start time.";
  if (!e.location.trim()) return "Add a location.";
  if (!Number.isInteger(e.capacity) || e.capacity < 1 || e.capacity > 500) return "Capacity must be between 1 and 500.";
  return null;
}

export async function createEvent(db: Client, e: EventInput, now: ClubNow): Promise<Result<{ id: number }>> {
  const err = validateEvent(e, now);
  if (err) return { ok: false, error: err };
  const rs = await db.execute({
    sql: "INSERT INTO events (title,category,description,date,start_time,end_time,location,capacity) VALUES (?,?,?,?,?,?,?,?)",
    args: [e.title.trim(), e.category, e.description.trim(), e.date, e.start_time, e.end_time, e.location.trim(), e.capacity],
  });
  return { ok: true, id: Number(rs.lastInsertRowid) };
}

export async function updateEvent(db: Client, id: number, e: EventInput, now: ClubNow): Promise<Result> {
  const err = validateEvent(e, now);
  if (err) return { ok: false, error: err };
  const going = Number((await db.execute({ sql: "SELECT count(*) AS n FROM rsvps WHERE event_id = ?", args: [id] })).rows[0].n);
  if (e.capacity < going) return { ok: false, error: `${going} members have already RSVP'd, so capacity can't go below ${going}.` };
  await db.execute({
    sql: "UPDATE events SET title=?, category=?, description=?, date=?, start_time=?, end_time=?, location=?, capacity=? WHERE id = ?",
    args: [e.title.trim(), e.category, e.description.trim(), e.date, e.start_time, e.end_time, e.location.trim(), e.capacity, id],
  });
  return { ok: true };
}

export async function setEventCancelled(db: Client, id: number, cancelled: boolean): Promise<Result> {
  await db.execute({ sql: "UPDATE events SET cancelled = ? WHERE id = ?", args: [cancelled ? 1 : 0, id] });
  return { ok: true };
}

export async function attendees(db: Client, eventId: number) {
  const rs = await db.execute({
    sql: "SELECT u.name, u.member_no FROM rsvps r JOIN users u ON u.id = r.user_id WHERE r.event_id = ? ORDER BY r.id",
    args: [eventId],
  });
  return rs.rows as unknown as { name: string; member_no: string }[];
}

export async function allEvents(db: Client) {
  const rs = await db.execute(
    "SELECT e.*, (SELECT count(*) FROM rsvps r WHERE r.event_id = e.id) AS going FROM events e ORDER BY e.date, e.start_time",
  );
  return rs.rows as unknown as (EventInput & { id: number; going: number; cancelled: number })[];
}

/** Daily figures for the stat tiles at the top of the desk. */
export function dayStats(rows: DeskBooking[], now: ClubNow, date: string) {
  const live = rows.filter((r) => r.status !== "cancelled");
  const startedOrPast = (r: DeskBooking) => date < now.date || (date === now.date && r.start_time <= now.time);
  return {
    total: live.length,
    checkedIn: live.filter((r) => r.status === "checked_in").length,
    noShows: live.filter((r) => r.status === "no_show").length,
    unaccounted: live.filter((r) => r.status === "booked" && startedOrPast(r)).length,
    fromApp: live.filter((r) => r.source === "app").length,
  };
}

export const SLOT_OPTIONS = SLOTS;
