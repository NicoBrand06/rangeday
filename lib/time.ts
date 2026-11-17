// All dates and times are in the club's local time zone, stored as plain strings:
// dates as "YYYY-MM-DD" and times as "HH:MM". Plain strings sort correctly and
// avoid time-zone bugs (the server on Vercel runs in UTC, the club does not).
// The time zone itself is a club setting (see lib/config.ts).

export type ClubNow = { date: string; time: string };

/** The current date and time at the club. */
export function clubNow(timeZone = "America/New_York", at: Date = new Date()): ClubNow {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
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

/** "09:00" + 60 -> "10:00 am" */
export function addMinutesLabel(time: string, mins: number): string {
  const [h, m] = time.split(":").map(Number);
  const t = h * 60 + m + mins;
  return prettyTime(`${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`);
}

/** A UTC Date shown as a short club-local date, e.g. "Thu 19 Nov". */
export function prettyInstant(d: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d); // YYYY-MM-DD
  return prettyDate(parts);
}
