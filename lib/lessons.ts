import type { Client } from "@libsql/client";
import { bookableDates, canMemberCancel, isPast, type Result } from "./booking";
import { activityFor, addMinutes, SLOT_MINUTES, toMinutes, weekdayOf, type ClubConfig } from "./config";
import type { ClubNow } from "./time";

// Lessons with instructors.
// - Each instructor teaches some disciplines and has weekly availability windows
//   (e.g. Tue 09:00-12:00 and Tue 13:00-17:00), plus blocked days off.
// - A lesson lasts lessonMinutes (default 60) and can start on any half hour inside a window.
// - No double-booking an instructor: because lessons can overlap (9:00 and 9:30), a simple
//   unique index isn't enough, so the overlap check and the insert are one statement.

export type Instructor = { id: number; name: string; specialty: string; disciplines: string[]; active: boolean };
export type HoursWindow = { weekday: number; start_time: string; end_time: string };
export type TimeOff = { date: string; reason: string | null };
export type LessonRow = {
  id: number;
  instructor_id: number;
  instructor_name: string;
  user_id: number;
  member_name: string;
  member_no: string;
  discipline: string;
  date: string;
  start_time: string;
  end_time: string;
  status: "booked" | "cancelled" | "done";
  source: "app" | "phone";
};

type Cfg = Pick<ClubConfig, "hours" | "activities" | "bookingDays" | "cancelCutoff" | "lessonMinutes">;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function toInstructor(r: Record<string, unknown>): Instructor {
  return {
    id: Number(r.id),
    name: String(r.name),
    specialty: String(r.specialty),
    disciplines: String(r.disciplines).split(",").filter(Boolean),
    active: Boolean(Number(r.active)),
  };
}

export async function listInstructors(db: Client, activeOnly = false): Promise<Instructor[]> {
  const rs = await db.execute(`SELECT * FROM instructors ${activeOnly ? "WHERE active = 1" : ""} ORDER BY active DESC, name`);
  return rs.rows.map((r) => toInstructor(r as unknown as Record<string, unknown>));
}

export async function getInstructor(db: Client, id: number) {
  const row = (await db.execute({ sql: "SELECT * FROM instructors WHERE id = ?", args: [id] })).rows[0];
  if (!row) return null;
  const [hours, off] = await Promise.all([
    db.execute({ sql: "SELECT weekday, start_time, end_time FROM instructor_hours WHERE instructor_id = ? ORDER BY weekday, start_time", args: [id] }),
    db.execute({ sql: "SELECT date, reason FROM instructor_time_off WHERE instructor_id = ? ORDER BY date", args: [id] }),
  ]);
  return {
    ...toInstructor(row as unknown as Record<string, unknown>),
    hours: hours.rows as unknown as HoursWindow[],
    timeOff: off.rows as unknown as TimeOff[],
  };
}

export async function saveInstructor(
  db: Client,
  cfg: Pick<ClubConfig, "activities">,
  input: { id?: number; name: string; specialty: string; disciplines: string[] },
): Promise<Result<{ id: number }>> {
  const name = input.name.trim().replace(/\s+/g, " ");
  const specialty = input.specialty.trim();
  if (name.length < 2 || name.length > 80) return { ok: false, error: "Enter the instructor's name." };
  if (!specialty || specialty.length > 80) return { ok: false, error: "Add a short specialty, e.g. \"Beginners and youth shooters\"." };
  const disciplines = [...new Set(input.disciplines)].filter((d) => activityFor(cfg, d));
  if (!disciplines.length) return { ok: false, error: "Pick at least one discipline they teach." };
  if (input.id) {
    const rs = await db.execute({
      sql: "UPDATE instructors SET name = ?, specialty = ?, disciplines = ? WHERE id = ?",
      args: [name, specialty, disciplines.join(","), input.id],
    });
    if (!rs.rowsAffected) return { ok: false, error: "Instructor not found." };
    return { ok: true, id: input.id };
  }
  const rs = await db.execute({ sql: "INSERT INTO instructors (name, specialty, disciplines) VALUES (?,?,?)", args: [name, specialty, disciplines.join(",")] });
  return { ok: true, id: Number(rs.lastInsertRowid) };
}

/** Instructors with lesson history are deactivated, never deleted. Booked lessons stay. */
export async function setInstructorActive(db: Client, id: number, active: boolean): Promise<Result> {
  await db.execute({ sql: "UPDATE instructors SET active = ? WHERE id = ?", args: [active ? 1 : 0, id] });
  return { ok: true };
}

/** Replace an instructor's weekly availability. Windows are on the half hour and can't overlap. */
export async function setWeeklyHours(db: Client, id: number, windows: HoursWindow[]): Promise<Result> {
  for (const w of windows) {
    if (!Number.isInteger(w.weekday) || w.weekday < 0 || w.weekday > 6) return { ok: false, error: "Pick a day of the week." };
    if (!TIME.test(w.start_time) || !TIME.test(w.end_time)) return { ok: false, error: "Enter start and end times." };
    if (toMinutes(w.start_time) % SLOT_MINUTES || toMinutes(w.end_time) % SLOT_MINUTES) return { ok: false, error: "Use times on the hour or half hour." };
    if (w.end_time <= w.start_time) return { ok: false, error: "Each end time must be after its start time." };
  }
  const sorted = [...windows].sort((a, b) => a.weekday - b.weekday || a.start_time.localeCompare(b.start_time));
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].weekday === sorted[i - 1].weekday && sorted[i].start_time < sorted[i - 1].end_time)
      return { ok: false, error: "Two time windows on the same day overlap." };
  }
  await db.batch(
    [
      { sql: "DELETE FROM instructor_hours WHERE instructor_id = ?", args: [id] },
      ...sorted.map((w) => ({
        sql: "INSERT INTO instructor_hours (instructor_id, weekday, start_time, end_time) VALUES (?,?,?,?)",
        args: [id, w.weekday, w.start_time, w.end_time],
      })),
    ],
    "write",
  );
  return { ok: true };
}

/**
 * Block a day off. Allowed even if lessons are booked that day: the result lists them
 * so staff can contact those members (they are not cancelled automatically).
 */
export async function blockDay(db: Client, id: number, date: string, reason: string, now: ClubNow): Promise<Result<{ affected: LessonRow[] }>> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "Pick a date." };
  if (date < now.date) return { ok: false, error: "That date has passed." };
  await db.execute({
    sql: "INSERT OR REPLACE INTO instructor_time_off (instructor_id, date, reason) VALUES (?,?,?)",
    args: [id, date, reason.trim().slice(0, 120) || null],
  });
  const affected = (await lessonSchedule(db, date, date)).filter((l) => l.instructor_id === id && l.status === "booked");
  return { ok: true, affected };
}

export async function unblockDay(db: Client, id: number, date: string): Promise<Result> {
  await db.execute({ sql: "DELETE FROM instructor_time_off WHERE instructor_id = ? AND date = ?", args: [id, date] });
  return { ok: true };
}

/** Start times an instructor can still take a lesson on a date. */
export async function openTimes(db: Client, cfg: Cfg, instructorId: number, date: string, now: ClubNow): Promise<string[]> {
  const day = cfg.hours.find((h) => h.weekday === weekdayOf(date));
  if (!day || day.closed) return [];
  const [windows, off, booked] = await Promise.all([
    db.execute({ sql: "SELECT start_time, end_time FROM instructor_hours WHERE instructor_id = ? AND weekday = ?", args: [instructorId, weekdayOf(date)] }),
    db.execute({ sql: "SELECT 1 FROM instructor_time_off WHERE instructor_id = ? AND date = ?", args: [instructorId, date] }),
    db.execute({ sql: "SELECT start_time, end_time FROM lessons WHERE instructor_id = ? AND date = ? AND status = 'booked'", args: [instructorId, date] }),
  ]);
  if (off.rows.length) return [];
  const len = cfg.lessonMinutes;
  const times: string[] = [];
  for (const w of windows.rows) {
    // Inside both the instructor's window and the club's opening hours.
    const from = Math.max(toMinutes(String(w.start_time)), toMinutes(day.open));
    const to = Math.min(toMinutes(String(w.end_time)), toMinutes(day.close));
    for (let m = Math.ceil(from / SLOT_MINUTES) * SLOT_MINUTES; m + len <= to; m += SLOT_MINUTES) {
      const start = addMinutes("00:00", m);
      const end = addMinutes(start, len);
      if (isPast(date, start, now)) continue;
      if (booked.rows.some((b) => String(b.start_time) < end && String(b.end_time) > start)) continue;
      times.push(start);
    }
  }
  return [...new Set(times)].sort();
}

/** "Book a lesson": instructors who teach this discipline and work that day, with open times. */
export async function availableInstructors(db: Client, cfg: Cfg, discipline: string, date: string, now: ClubNow) {
  const all = (await listInstructors(db, true)).filter((i) => i.disciplines.includes(discipline));
  const out: { instructor: Instructor; times: string[]; working: boolean }[] = [];
  for (const instructor of all) {
    const works = await db.execute({
      sql: `SELECT 1 FROM instructor_hours WHERE instructor_id = ?1 AND weekday = ?2
            AND NOT EXISTS (SELECT 1 FROM instructor_time_off WHERE instructor_id = ?1 AND date = ?3)`,
      args: [instructor.id, weekdayOf(date), date],
    });
    if (!works.rows.length) continue;
    out.push({ instructor, times: await openTimes(db, cfg, instructor.id, date, now), working: true });
  }
  return out;
}

export async function bookLesson(
  db: Client,
  cfg: Cfg,
  l: { instructorId: number; userId: number; discipline: string; date: string; time: string; source?: "app" | "phone" },
  now: ClubNow,
): Promise<Result<{ id: number }>> {
  const ins = (await db.execute({ sql: "SELECT * FROM instructors WHERE id = ?", args: [l.instructorId] })).rows[0];
  const instructor = ins ? toInstructor(ins as unknown as Record<string, unknown>) : null;
  if (!instructor || !instructor.active) return { ok: false, error: "That instructor isn't taking lessons." };
  if (!instructor.disciplines.includes(l.discipline)) return { ok: false, error: `${instructor.name} doesn't teach that discipline.` };
  if (!bookableDates(cfg, now).includes(l.date)) return { ok: false, error: `Lessons can be booked up to ${cfg.bookingDays} days ahead.` };
  const user = (await db.execute({ sql: "SELECT active FROM users WHERE id = ?", args: [l.userId] })).rows[0];
  if (!user || !Number(user.active)) return { ok: false, error: "That member account isn't active." };
  if (!(await openTimes(db, cfg, l.instructorId, l.date, now)).includes(l.time))
    return { ok: false, error: `${instructor.name} isn't free at that time. Pick another time.` };

  const end = addMinutes(l.time, cfg.lessonMinutes);
  // One statement: insert only if neither the instructor nor the member has an overlapping lesson.
  const rs = await db.execute({
    sql: `INSERT INTO lessons (instructor_id, user_id, discipline, date, start_time, end_time, source)
          SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7
          WHERE NOT EXISTS (SELECT 1 FROM lessons WHERE status = 'booked' AND date = ?4
                            AND (instructor_id = ?1 OR user_id = ?2) AND start_time < ?6 AND end_time > ?5)`,
    args: [l.instructorId, l.userId, l.discipline, l.date, l.time, end, l.source ?? "app"],
  });
  if (rs.rowsAffected) return { ok: true, id: Number(rs.lastInsertRowid) };
  const mine = await db.execute({
    sql: "SELECT 1 FROM lessons WHERE status = 'booked' AND date = ? AND user_id = ? AND start_time < ? AND end_time > ?",
    args: [l.date, l.userId, end, l.time],
  });
  return mine.rows.length
    ? { ok: false, error: "You already have a lesson at that time." }
    : { ok: false, error: `Sorry, someone just booked ${instructor.name} at that time. Pick another time.` };
}

const SELECT = `SELECT l.*, i.name AS instructor_name, u.name AS member_name, u.member_no
  FROM lessons l JOIN instructors i ON i.id = l.instructor_id JOIN users u ON u.id = l.user_id`;

export async function getLesson(db: Client, id: number): Promise<LessonRow | null> {
  return ((await db.execute({ sql: `${SELECT} WHERE l.id = ?`, args: [id] })).rows[0] as unknown as LessonRow) ?? null;
}

export async function cancelLesson(
  db: Client,
  cfg: Pick<ClubConfig, "cancelCutoff">,
  id: number,
  actor: { id: number; role: "member" | "staff" },
  now: ClubNow,
): Promise<Result> {
  const l = await getLesson(db, id);
  if (!l) return { ok: false, error: "Lesson not found." };
  if (actor.role !== "staff" && l.user_id !== actor.id) return { ok: false, error: "You can only cancel your own lessons." };
  if (l.status !== "booked") return { ok: false, error: "This lesson is already cancelled or finished." };
  if (isPast(l.date, l.start_time, now)) return { ok: false, error: "This lesson has already started." };
  if (actor.role !== "staff" && !canMemberCancel(cfg, l.date, now))
    return { ok: false, error: `Free cancellation closed at ${cfg.cancelCutoff} the day before. Please call the front desk.` };
  await db.execute({ sql: "UPDATE lessons SET status = 'cancelled' WHERE id = ? AND status = 'booked'", args: [id] });
  return { ok: true };
}

export async function memberLessons(db: Client, userId: number, now: ClubNow): Promise<{ upcoming: LessonRow[]; past: LessonRow[] }> {
  const rows = (await db.execute({ sql: `${SELECT} WHERE l.user_id = ? ORDER BY l.date, l.start_time`, args: [userId] })).rows as unknown as LessonRow[];
  const upcoming = rows.filter((r) => r.status === "booked" && !isPast(r.date, r.start_time, now));
  return { upcoming, past: rows.filter((r) => !upcoming.includes(r)).reverse() };
}

/** Staff: every lesson in a date range, with instructor and member names. */
export async function lessonSchedule(db: Client, from: string, to: string): Promise<LessonRow[]> {
  const rs = await db.execute({
    sql: `${SELECT} WHERE l.date BETWEEN ? AND ? ORDER BY l.date, l.start_time, i.name`,
    args: [from, to],
  });
  return rs.rows as unknown as LessonRow[];
}
