import type { Client } from "@libsql/client";
import { crowdFor, type Crowd } from "./booking";
import { slotsFor, type ActivityMode, type ClubConfig } from "./config";
import type { ClubNow } from "./time";
import { peopleOnCourse } from "./visits";

// "How busy is it?", per area and hour by hour. It's the case study's utilization
// metric (booked / available), measured the way each area is used:
//   slot       - fields booked out of fields available
//   shared     - people booked out of the per-slot limit
//   walkaround - estimated people on the course (check-ins + expected) out of the
//                number where it starts to feel busy
// Levels: Quiet under 35%, Moderate 35-69%, Busy 70% and up.

export type Level = Crowd;
export type HourBusy = { hour: number; booked: number; capacity: number; pct: number; level: Level };
export type AreaBusy = { activity: string; label: string; mode: ActivityMode; hours: HourBusy[] };

export const levelFor = crowdFor;

type Cfg = Pick<ClubConfig, "hours" | "activities" | "roundMinutes">;

/** The hours the club is open on a date, e.g. [8, 9, ... 16]. Empty when closed. */
export function openHours(cfg: Pick<ClubConfig, "hours">, date: string): number[] {
  return [...new Set(slotsFor(cfg, date).map((t) => Number(t.slice(0, 2))))];
}

function hourOf(t: string) {
  return Number(t.slice(0, 2));
}

function toHour(hour: number, booked: number, capacity: number): HourBusy {
  const pct = capacity ? Math.min(100, Math.round((booked / capacity) * 100)) : 0;
  return { hour, booked, capacity, pct, level: levelFor(pct) };
}

/** Hour-by-hour busyness for every active area on a date. */
export async function busyByArea(db: Client, cfg: Cfg, date: string, now: ClubNow): Promise<AreaBusy[]> {
  const slots = slotsFor(cfg, date);
  if (!slots.length) return [];
  const hours = openHours(cfg, date);
  const slotsIn = (h: number) => slots.filter((t) => hourOf(t) === h);

  const stationRs = await db.execute("SELECT activity, count(*) AS n FROM stations WHERE active = 1 GROUP BY activity");
  const stationsOf = new Map(stationRs.rows.map((r) => [String(r.activity), Number(r.n)]));
  const rs = await db.execute({
    sql: `SELECT s.activity, CAST(substr(b.start_time, 1, 2) AS INTEGER) AS hour, count(*) AS parties, sum(b.party_size) AS people
          FROM bookings b JOIN stations s ON s.id = b.station_id
          WHERE b.date = ? AND b.status != 'cancelled' GROUP BY s.activity, hour`,
    args: [date],
  });
  const used = new Map(rs.rows.map((r) => [`${r.activity}|${r.hour}`, { parties: Number(r.parties), people: Number(r.people) }]));

  const out: AreaBusy[] = [];
  for (const a of cfg.activities.filter((x) => x.active && stationsOf.get(x.key))) {
    let rows: HourBusy[];
    if (a.mode === "walkaround") {
      const course = await peopleOnCourse(db, cfg, a.key, date, now);
      rows = hours.map((h) => {
        const inHour = course.filter((c) => hourOf(c.time) === h);
        const peak = Math.max(0, ...inHour.map((c) => c.people));
        return toHour(h, peak, a.perSlot ?? 1);
      });
    } else {
      rows = hours.map((h) => {
        const u = used.get(`${a.key}|${h}`) ?? { parties: 0, people: 0 };
        const n = slotsIn(h).length;
        return a.mode === "slot" ? toHour(h, u.parties, (stationsOf.get(a.key) ?? 0) * n) : toHour(h, u.people, (a.perSlot ?? 1) * n);
      });
    }
    out.push({ activity: a.key, label: a.label, mode: a.mode, hours: rows });
  }
  return out;
}

/** Whole-club view: the average of every area's percentage, hour by hour. */
export function clubWide(areas: AreaBusy[]): HourBusy[] {
  if (!areas.length) return [];
  return areas[0].hours.map((h, i) => {
    const pct = Math.round(areas.reduce((sum, a) => sum + a.hours[i].pct, 0) / areas.length);
    return { hour: h.hour, booked: pct, capacity: 100, pct, level: levelFor(pct) };
  });
}

/** Level right now (or at opening, before the club opens) and the busiest hour. */
export function areaNow(hours: HourBusy[], now: ClubNow, date = now.date): { current: HourBusy | null; peak: HourBusy | null } {
  if (!hours.length) return { current: null, peak: null };
  const peak = hours.reduce((a, b) => (b.pct > a.pct ? b : a));
  if (date !== now.date) return { current: null, peak };
  return { current: hours.find((x) => x.hour === hourOf(now.time)) ?? null, peak };
}

/** A one-line summary for the top of the meter. */
export function busySummary(hours: HourBusy[], now: ClubNow, date = now.date): { headline: string; tip: string | null } {
  if (!hours.length) return { headline: "Closed", tip: null };
  const peak = hours.reduce((a, b) => (b.pct > a.pct ? b : a));
  if (date !== now.date) {
    return { headline: `Busiest: ${fmtHour(peak.hour)}`, tip: date < now.date ? null : "Based on bookings and planned visits so far" };
  }
  const h = hourOf(now.time);
  const open = hours[0].hour;
  const close = hours[hours.length - 1].hour + 1;
  const rest = hours.filter((x) => x.hour > h);
  const quietest = rest.length ? rest.reduce((a, b) => (b.pct < a.pct ? b : a)) : null;
  const tip = quietest ? `Quietest time left today: ${fmtHour(quietest.hour)}` : null;
  if (h < open) return { headline: `Opens at ${fmtHour(open)}`, tip: `Busiest today: ${fmtHour(peak.hour)}` };
  if (h >= close) return { headline: "Closed for the day", tip: null };
  const current = hours.find((x) => x.hour === h) ?? hours[0];
  return { headline: `Right now: ${LEVEL_LABEL[current.level]}`, tip };
}

export const LEVEL_LABEL: Record<Level, string> = { quiet: "Quiet", moderate: "Moderate", busy: "Busy" };

export function fmtHour(h: number) {
  return h === 12 ? "12 pm" : h > 12 ? `${h - 12} pm` : `${h} am`;
}
