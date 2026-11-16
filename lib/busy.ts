import type { Client } from "@libsql/client";
import { SLOTS } from "./club";
import type { ClubNow } from "./time";

// "How busy is it?" = share of station time that is booked, hour by hour.
// It's the same idea as the case study's utilization metric
// (booked station-hours / available station-hours), shown to members.

export type Level = "quiet" | "moderate" | "busy";
export type HourBusy = { hour: number; booked: number; capacity: number; pct: number; level: Level };

export const HOURS = [...new Set(SLOTS.map((t) => Number(t.slice(0, 2))))]; // 8 .. 16

export function levelFor(pct: number): Level {
  return pct >= 70 ? "busy" : pct >= 35 ? "moderate" : "quiet";
}

export async function busyByHour(db: Client, date: string): Promise<HourBusy[]> {
  const stations = Number((await db.execute("SELECT count(*) AS n FROM stations")).rows[0].n);
  const rs = await db.execute({
    sql: `SELECT CAST(substr(start_time, 1, 2) AS INTEGER) AS hour, count(*) AS n
          FROM bookings WHERE date = ? AND status != 'cancelled' GROUP BY hour`,
    args: [date],
  });
  const byHour = new Map(rs.rows.map((r) => [Number(r.hour), Number(r.n)]));
  return HOURS.map((hour) => {
    const slotsInHour = SLOTS.filter((t) => Number(t.slice(0, 2)) === hour).length;
    const capacity = stations * slotsInHour;
    const booked = byHour.get(hour) ?? 0;
    const pct = capacity ? Math.round((booked / capacity) * 100) : 0;
    return { hour, booked, capacity, pct, level: levelFor(pct) };
  });
}

/** A one-line summary for the top of the meter. */
export function busySummary(hours: HourBusy[], now: ClubNow, date = now.date): { headline: string; tip: string | null } {
  if (date !== now.date) {
    const peak = hours.reduce((a, b) => (b.pct > a.pct ? b : a));
    return { headline: `Peak: ${fmtHour(peak.hour)} (${peak.pct}% booked)`, tip: date < now.date ? null : "Based on bookings so far" };
  }
  const h = Number(now.time.slice(0, 2));
  const open = HOURS[0];
  const close = HOURS[HOURS.length - 1] + 1;
  const label = { quiet: "Quiet", moderate: "Moderately busy", busy: "Busy" };
  const rest = hours.filter((x) => x.hour > h);
  const quietest = rest.length ? rest.reduce((a, b) => (b.pct < a.pct ? b : a)) : null;
  const tip = quietest ? `Quietest time left today: ${fmtHour(quietest.hour)}` : null;
  if (h < open) return { headline: `Opens at ${fmtHour(open)}`, tip: `Busiest today: ${fmtHour(hours.reduce((a, b) => (b.pct > a.pct ? b : a)).hour)}` };
  if (h >= close) return { headline: "Closed for the day", tip: null };
  const current = hours.find((x) => x.hour === h)!;
  return { headline: `Right now: ${label[current.level]}`, tip };
}

export function fmtHour(h: number) {
  return h === 12 ? "12 pm" : h > 12 ? `${h - 12} pm` : `${h} am`;
}
