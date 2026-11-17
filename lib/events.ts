import type { Client } from "@libsql/client";
import type { Result } from "./booking";
import { addDays, type ClubNow } from "./time";

// Events: one-offs and repeating series, RSVPs with a waitlist, and the staff tools.

export type RsvpStatus = "going" | "waitlist";

export type EventRow = {
  id: number;
  series_id: number | null;
  title: string;
  category: string;
  description: string;
  date: string;
  start_time: string;
  end_time: string;
  location: string;
  capacity: number;
  cancelled: number;
  going: number; // confirmed places taken
  waiting: number; // people on the waitlist
  mine: RsvpStatus | null; // the viewer's status
  my_position: number | null; // 1 = next in line, when the viewer is waitlisted
};

export type Series = {
  id: number;
  title: string;
  category: string;
  description: string;
  location: string;
  start_time: string;
  end_time: string;
  capacity: number;
  rule: "weekly" | "monthly" | "yearly";
  weekday: number | null;
  nth: number | null;
  month_day: string | null;
  starts_on: string;
  active: number;
};

export const EVENT_CATEGORIES = ["Social", "Members", "Clinic", "League", "Tournament", "Annual"];
export const REPEAT_OPTIONS = ["none", "weekly", "monthly", "yearly"] as const;
export type Repeat = (typeof REPEAT_OPTIONS)[number];

const SELECT = `SELECT e.*,
  (SELECT count(*) FROM rsvps r WHERE r.event_id = e.id AND r.status = 'going') AS going,
  (SELECT count(*) FROM rsvps r WHERE r.event_id = e.id AND r.status = 'waitlist') AS waiting,
  (SELECT r.status FROM rsvps r WHERE r.event_id = e.id AND r.user_id = ?1) AS mine,
  (SELECT count(*) FROM rsvps w WHERE w.event_id = e.id AND w.status = 'waitlist'
     AND w.id <= (SELECT r.id FROM rsvps r WHERE r.event_id = e.id AND r.user_id = ?1 AND r.status = 'waitlist')) AS my_position
  FROM events e`;

function fix(row: Record<string, unknown>): EventRow {
  const e = row as unknown as EventRow;
  return { ...e, going: Number(e.going), waiting: Number(e.waiting), my_position: e.mine === "waitlist" ? Number(e.my_position) : null };
}

export function hasStarted(e: Pick<EventRow, "date" | "start_time">, now: ClubNow) {
  return e.date < now.date || (e.date === now.date && e.start_time <= now.time);
}

export function spotsLeft(e: Pick<EventRow, "capacity" | "going">) {
  return Math.max(0, e.capacity - e.going);
}

// ---------- Repeating series ----------

const dow = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

/** "Weekly on Thursdays", "First Saturday of the month", "Every year on 15 May". */
export function describeRule(s: Pick<Series, "rule" | "weekday" | "nth" | "month_day">): string {
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const nths = ["", "First", "Second", "Third", "Fourth", "Last"];
  if (s.rule === "weekly") return `Every ${days[s.weekday ?? 0]}`;
  if (s.rule === "monthly") return `${nths[s.nth ?? 1]} ${days[s.weekday ?? 0]} of the month`;
  const [m, d] = (s.month_day ?? "01-01").split("-").map(Number);
  const month = new Date(Date.UTC(2026, m - 1, 1)).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
  return `Every year on ${d} ${month}`;
}

/** The dates a series falls on between `from` and `to` (inclusive). */
export function seriesDates(s: Pick<Series, "rule" | "weekday" | "nth" | "month_day" | "starts_on">, from: string, to: string): string[] {
  const start = from > s.starts_on ? from : s.starts_on;
  const out: string[] = [];
  if (s.rule === "weekly") {
    for (let d = start; d <= to; d = addDays(d, 1)) if (dow(d) === s.weekday) out.push(d);
  } else if (s.rule === "monthly") {
    for (let d = start; d <= to; d = addDays(d, 1)) {
      if (dow(d) !== s.weekday) continue;
      const day = Number(d.slice(8));
      const nth = Math.ceil(day / 7);
      const isLast = addDays(d, 7).slice(5, 7) !== d.slice(5, 7);
      if (nth === s.nth || (s.nth === 5 && isLast)) out.push(d);
    }
  } else {
    for (let y = Number(start.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) {
      const d = `${y}-${s.month_day}`;
      if (!Number.isNaN(Date.parse(`${d}T12:00:00Z`)) && addDays(d, 0) === d && d >= start && d <= to) out.push(d);
    }
  }
  return out;
}

export const HORIZON_DAYS = 84; // repeating events are listed about 12 weeks ahead
const YEARLY_HORIZON_DAYS = 400; // a yearly event always shows its next date

let lastTopUp = "";

/** Create any missing upcoming occurrences of active series. Cheap to call; runs at most once a day per server. */
export async function ensureOccurrences(db: Client, today: string, force = false) {
  if (!force && lastTopUp === today) return;
  const series = (await db.execute("SELECT * FROM event_series WHERE active = 1")).rows as unknown as Series[];
  const stmts = [];
  for (const s of series) {
    const to = addDays(today, s.rule === "yearly" ? YEARLY_HORIZON_DAYS : HORIZON_DAYS);
    for (const date of seriesDates(s, today, to)) {
      stmts.push({
        sql: `INSERT OR IGNORE INTO events (series_id,title,category,description,date,start_time,end_time,location,capacity)
              VALUES (?,?,?,?,?,?,?,?,?)`,
        args: [s.id, s.title, s.category, s.description, date, s.start_time, s.end_time, s.location, s.capacity],
      });
    }
  }
  if (stmts.length) await db.batch(stmts, "write");
  lastTopUp = today;
}

// ---------- Member side ----------

export async function upcomingEvents(db: Client, userId: number, now: ClubNow): Promise<EventRow[]> {
  await ensureOccurrences(db, now.date);
  const rs = await db.execute({
    sql: `${SELECT} WHERE (e.date > ?2 OR (e.date = ?2 AND e.start_time > ?3)) ORDER BY e.date, e.start_time`,
    args: [userId, now.date, now.time],
  });
  return rs.rows.map(fix);
}

export async function getEvent(db: Client, id: number, userId: number): Promise<EventRow | null> {
  const row = (await db.execute({ sql: `${SELECT} WHERE e.id = ?2`, args: [userId, id] })).rows[0];
  return row ? fix(row) : null;
}

/**
 * RSVP to an event. If there's room you're going; if it's full you join the waitlist.
 * One database statement decides which, so two members can't both take the last place.
 */
export async function rsvp(db: Client, eventId: number, userId: number, now: ClubNow): Promise<Result<{ status: RsvpStatus }>> {
  const e = await getEvent(db, eventId, userId);
  if (!e) return { ok: false, error: "Event not found." };
  if (e.cancelled) return { ok: false, error: "This event has been cancelled." };
  if (hasStarted(e, now)) return { ok: false, error: "This event has already started." };
  if (e.mine) return { ok: false, error: e.mine === "going" ? "You're already on the list." : "You're already on the waitlist." };
  try {
    const rs = await db.execute({
      sql: `INSERT INTO rsvps (event_id, user_id, status)
            SELECT ?1, ?2, CASE WHEN (SELECT count(*) FROM rsvps WHERE event_id = ?1 AND status = 'going')
                                     < (SELECT capacity FROM events WHERE id = ?1) THEN 'going' ELSE 'waitlist' END
            RETURNING status`,
      args: [eventId, userId],
    });
    return { ok: true, status: rs.rows[0].status as RsvpStatus };
  } catch (err) {
    if (String(err).includes("UNIQUE")) return { ok: false, error: "You're already on the list." };
    throw err;
  }
}

/** Move the earliest waitlisted members into any free places. Returns who was promoted. */
export async function promoteWaitlist(db: Client, eventId: number): Promise<number[]> {
  const rs = await db.execute({
    sql: `UPDATE rsvps SET status = 'going'
          WHERE id IN (
            SELECT id FROM rsvps WHERE event_id = ?1 AND status = 'waitlist' ORDER BY id
            LIMIT max(0, (SELECT capacity FROM events WHERE id = ?1 AND cancelled = 0)
                         - (SELECT count(*) FROM rsvps WHERE event_id = ?1 AND status = 'going'))
          )
          RETURNING user_id`,
    args: [eventId],
  });
  return rs.rows.map((r) => Number(r.user_id));
}

/** Leave an event (or its waitlist). If a place opens, the next person in line gets it. */
export async function cancelRsvp(db: Client, eventId: number, userId: number, now: ClubNow): Promise<Result<{ promoted: number[] }>> {
  const e = await getEvent(db, eventId, userId);
  if (!e || !e.mine) return { ok: false, error: "You're not on the list for this event." };
  if (hasStarted(e, now)) return { ok: false, error: "This event has already started." };
  await db.execute({ sql: "DELETE FROM rsvps WHERE event_id = ? AND user_id = ?", args: [eventId, userId] });
  return { ok: true, promoted: await promoteWaitlist(db, eventId) };
}

// ---------- Staff side ----------

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

export function validateEvent(e: EventInput, now: ClubNow): string | null {
  if (!e.title.trim()) return "Give the event a title.";
  if (e.title.length > 80) return "Keep the title under 80 characters.";
  if (!EVENT_CATEGORIES.includes(e.category)) return "Pick a category.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) return "Pick a date.";
  if (e.date < now.date) return "The date is in the past.";
  if (!/^\d{2}:\d{2}$/.test(e.start_time) || !/^\d{2}:\d{2}$/.test(e.end_time)) return "Set a start and end time.";
  if (e.end_time <= e.start_time) return "The end time must be after the start time.";
  if (!e.location.trim()) return "Add a location.";
  if (!Number.isInteger(e.capacity) || e.capacity < 1 || e.capacity > 1000) return "Places must be between 1 and 1,000.";
  return null;
}

/** Create a one-off event, or a repeating series starting on the chosen date. Returns the first event's id. */
export async function createEvent(db: Client, e: EventInput, repeat: Repeat, now: ClubNow): Promise<Result<{ id: number }>> {
  const err = validateEvent(e, now);
  if (err) return { ok: false, error: err };
  const base = [e.title.trim(), e.category, e.description.trim(), e.location.trim(), e.start_time, e.end_time, e.capacity];
  if (repeat === "none") {
    const rs = await db.execute({
      sql: "INSERT INTO events (title,category,description,location,start_time,end_time,capacity,date) VALUES (?,?,?,?,?,?,?,?)",
      args: [...base, e.date],
    });
    return { ok: true, id: Number(rs.lastInsertRowid) };
  }
  const nth = Math.ceil(Number(e.date.slice(8)) / 7);
  if (repeat === "monthly" && nth === 5) return { ok: false, error: "Monthly events need a date in the first four weeks of the month." };
  const rs = await db.execute({
    sql: `INSERT INTO event_series (title,category,description,location,start_time,end_time,capacity,rule,weekday,nth,month_day,starts_on)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    args: [...base, repeat, repeat === "yearly" ? null : dow(e.date), repeat === "monthly" ? nth : null, repeat === "yearly" ? e.date.slice(5) : null, e.date],
  });
  const seriesId = Number(rs.lastInsertRowid);
  await ensureOccurrences(db, now.date, true);
  const first = (await db.execute({ sql: "SELECT id FROM events WHERE series_id = ? ORDER BY date LIMIT 1", args: [seriesId] })).rows[0];
  return { ok: true, id: Number(first.id) };
}

/**
 * Edit an event. scope "one" changes just this date; scope "future" changes this and every
 * later date in its series. Places can't drop below the number already going, and if
 * places go up, people on the waitlist move up automatically.
 */
export async function updateEvent(
  db: Client,
  id: number,
  e: EventInput,
  scope: "one" | "future",
  now: ClubNow,
): Promise<Result<{ promoted: number[] }>> {
  const current = await getEvent(db, id, 0);
  if (!current) return { ok: false, error: "Event not found." };
  const err = validateEvent(e, now);
  if (err) return { ok: false, error: err };
  if (current.series_id && e.date !== current.date)
    return { ok: false, error: "Dates in a repeating series can't be moved. Cancel this date and create a one-off event instead." };

  const affected = (
    scope === "future" && current.series_id
      ? (await db.execute({ sql: "SELECT id FROM events WHERE series_id = ? AND date >= ? AND cancelled = 0", args: [current.series_id, current.date] })).rows.map((r) => Number(r.id))
      : [id]
  );
  for (const eid of affected) {
    const going = Number((await db.execute({ sql: "SELECT count(*) AS n FROM rsvps WHERE event_id = ? AND status = 'going'", args: [eid] })).rows[0].n);
    if (e.capacity < going) {
      return { ok: false, error: `${going} members are already going${eid === id ? "" : " to a later date"}, so places can't go below ${going}.` };
    }
  }
  const fields = [e.title.trim(), e.category, e.description.trim(), e.start_time, e.end_time, e.location.trim(), e.capacity];
  const stmts = affected.map((eid) => ({
    sql: "UPDATE events SET title=?, category=?, description=?, start_time=?, end_time=?, location=?, capacity=? WHERE id = ?",
    args: [...fields, eid],
  }));
  if (!current.series_id) stmts.push({ sql: "UPDATE events SET date = ? WHERE id = ?", args: [e.date, id] });
  if (scope === "future" && current.series_id) {
    stmts.push({
      sql: "UPDATE event_series SET title=?, category=?, description=?, start_time=?, end_time=?, location=?, capacity=? WHERE id = ?",
      args: [...fields, current.series_id],
    });
  }
  await db.batch(stmts, "write");
  const promoted: number[] = [];
  for (const eid of affected) promoted.push(...(await promoteWaitlist(db, eid)));
  return { ok: true, promoted };
}

/** Cancel (or reinstate) one date, or cancel this and every later date in the series. */
export async function setEventCancelled(db: Client, id: number, cancelled: boolean, scope: "one" | "future" = "one"): Promise<Result> {
  const e = await getEvent(db, id, 0);
  if (!e) return { ok: false, error: "Event not found." };
  if (scope === "future" && e.series_id && cancelled) {
    await db.batch(
      [
        { sql: "UPDATE event_series SET active = 0 WHERE id = ?", args: [e.series_id] },
        { sql: "UPDATE events SET cancelled = 1 WHERE series_id = ? AND date >= ?", args: [e.series_id, e.date] },
      ],
      "write",
    );
    return { ok: true };
  }
  await db.execute({ sql: "UPDATE events SET cancelled = ? WHERE id = ?", args: [cancelled ? 1 : 0, id] });
  if (!cancelled) await promoteWaitlist(db, id);
  return { ok: true };
}

export async function signupLists(db: Client, eventId: number) {
  const rs = await db.execute({
    sql: `SELECT u.name, u.member_no, r.status, r.created_at FROM rsvps r JOIN users u ON u.id = r.user_id
          WHERE r.event_id = ? ORDER BY r.id`,
    args: [eventId],
  });
  const rows = rs.rows as unknown as { name: string; member_no: string; status: RsvpStatus; created_at: string }[];
  return { going: rows.filter((r) => r.status === "going"), waitlist: rows.filter((r) => r.status === "waitlist") };
}

export async function staffEventList(db: Client, now: ClubNow) {
  await ensureOccurrences(db, now.date);
  const rs = await db.execute({
    sql: `SELECT e.*, s.rule, s.weekday AS s_weekday, s.nth, s.month_day, s.active AS series_active,
            (SELECT count(*) FROM rsvps r WHERE r.event_id = e.id AND r.status = 'going') AS going,
            (SELECT count(*) FROM rsvps r WHERE r.event_id = e.id AND r.status = 'waitlist') AS waiting
          FROM events e LEFT JOIN event_series s ON s.id = e.series_id
          WHERE e.date >= ? ORDER BY e.date, e.start_time`,
    args: [now.date],
  });
  return rs.rows.map((r) => ({
    ...(r as unknown as EventRow),
    going: Number(r.going),
    waiting: Number(r.waiting),
    repeat: r.rule ? describeRule({ rule: r.rule as Series["rule"], weekday: r.s_weekday as number, nth: r.nth as number, month_day: r.month_day as string }) : null,
  }));
}

export async function getSeries(db: Client, id: number | null): Promise<Series | null> {
  if (!id) return null;
  return ((await db.execute({ sql: "SELECT * FROM event_series WHERE id = ?", args: [id] })).rows[0] as unknown as Series) ?? null;
}
