// All dates and times are in the club's local time zone, stored as plain strings:
// dates as "YYYY-MM-DD" and times as "HH:MM". Plain strings sort correctly and
// avoid time-zone bugs (the server on Vercel runs in UTC, the club does not).

export const CLUB_TZ = "America/New_York";

export type ClubNow = { date: string; time: string };

/** The current date and time at the club. */
export function clubNow(at: Date = new Date()): ClubNow {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CLUB_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

/** Add days to a "YYYY-MM-DD" date. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "2026-11-21" -> "Sat" */
export function weekday(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
}

/** "2026-11-21" -> "Sat 21 Nov" */
export function prettyDate(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  const day = d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  const month = d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  return `${day} ${d.getUTCDate()} ${month}`;
}

/** "13:30" -> "1:30 pm" */
export function prettyTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** Morning / afternoon / evening greeting for the home screen. */
export function greeting(now: ClubNow): string {
  const h = Number(now.time.slice(0, 2));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}
