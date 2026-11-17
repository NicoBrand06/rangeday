import type { Client } from "@libsql/client";
import type { User } from "./accounts";
import { getBooking, type BookingRow, type Result } from "./booking";
import type { ClubNow } from "./time";

// Rules for the front desk console (F11 in the case study) and the People page.

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

/** Active members, for the phone-booking pickers. */
export async function members(db: Client) {
  const rs = await db.execute("SELECT id, name, member_no FROM users WHERE role = 'member' AND active = 1 ORDER BY name");
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

// ---- People ----

export type Person = {
  id: number;
  name: string;
  email: string | null;
  member_no: string;
  role: "member" | "staff";
  active: number;
  is_demo: number;
  created_at: string;
};

/** "jordan.ellis@example.com" -> "jo•••@example.com" (shown to demo staff on the public demo). */
export function maskEmail(email: string | null) {
  if (!email) return "";
  const [local, domain] = email.split("@");
  return `${local.slice(0, 2)}•••@${domain}`;
}

export async function listPeople(db: Client, q = ""): Promise<Person[]> {
  const like = `%${q.trim()}%`;
  const rs = await db.execute({
    sql: `SELECT id, name, email, member_no, role, active, is_demo, created_at FROM users
          WHERE name != 'Deleted member' AND (? = '%%' OR name LIKE ? OR email LIKE ? OR member_no LIKE ?)
          ORDER BY active DESC, role DESC, name LIMIT 200`,
    args: [like, like, like, like],
  });
  return rs.rows as unknown as Person[];
}

/**
 * Who may change whom:
 * - Nobody can change their own role or deactivate themselves (so the club can't lock itself out).
 * - The last active staff account can't be demoted.
 * - On the public demo, the shared demo staff login can only change demo accounts, never
 *   real sign-ups (otherwise any visitor could take over a real account).
 */
async function guard(db: Client, actor: Pick<User, "id" | "is_demo">, userId: number): Promise<Result<{ target: Person }>> {
  const target = (await db.execute({ sql: "SELECT id, name, email, member_no, role, active, is_demo, created_at FROM users WHERE id = ?", args: [userId] }))
    .rows[0] as unknown as Person | undefined;
  if (!target) return { ok: false, error: "Account not found." };
  if (target.id === actor.id) return { ok: false, error: "You can't change your own account here. Ask another staff member." };
  if (Number(actor.is_demo) && !Number(target.is_demo)) return { ok: false, error: "The demo staff login can't change real accounts." };
  return { ok: true, target };
}

export async function setRole(db: Client, actor: Pick<User, "id" | "is_demo">, userId: number, role: "member" | "staff"): Promise<Result> {
  const g = await guard(db, actor, userId);
  if (!g.ok) return g;
  if (role === "member" && g.target.role === "staff") {
    const n = Number((await db.execute("SELECT count(*) AS n FROM users WHERE role = 'staff' AND active = 1")).rows[0].n);
    if (n <= 1) return { ok: false, error: "This is the last staff account, so it can't be changed to a member." };
  }
  await db.execute({ sql: "UPDATE users SET role = ? WHERE id = ?", args: [role, userId] });
  return { ok: true };
}

export async function setActive(db: Client, actor: Pick<User, "id" | "is_demo">, userId: number, active: boolean): Promise<Result> {
  const g = await guard(db, actor, userId);
  if (!g.ok) return g;
  await db.batch(
    [
      { sql: "UPDATE users SET active = ? WHERE id = ?", args: [active ? 1 : 0, userId] },
      ...(active ? [] : [{ sql: "DELETE FROM sessions WHERE user_id = ?", args: [userId] }]),
    ],
    "write",
  );
  return { ok: true };
}

export { guard as canManage };
