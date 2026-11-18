import type { Client } from "@libsql/client";

// Club settings live in the database, so any club can change them from the
// staff Settings page instead of editing code. Missing values fall back to DEFAULTS.

export type Hours = { weekday: number; open: string; close: string; closed: boolean };
export type ActivityMode = "slot" | "shared" | "walkaround";
export const MODE_LABEL: Record<ActivityMode, string> = { slot: "Slot-booked", shared: "Shared", walkaround: "Walk-around" };
/** perSlot: the headcount limit for "shared", the "starts to feel busy" number for "walkaround", unused for "slot". */
export type Activity = { key: string; label: string; mode: ActivityMode; perSlot: number | null; sort: number; active: boolean };

export type Settings = {
  clubName: string;
  tagline: string;
  shopPhone: string; // shown on "Let the shop know" for urgent or safety issues
  logo: string | null; // data: URL of an uploaded image
  primary: string; // header / navy colour
  accent: string; // button / green colour
  timezone: string;
  bookingDays: number; // how many days ahead members can book (including today)
  maxPerDay: number; // bookings per member per day
  cancelCutoff: string; // members can cancel until this time the day before
  reservationExpiryDays: number; // pickup requests and holds expire after this many days
  roundMinutes: number; // walk-around: how long a check-in counts as "on the course"
  lessonMinutes: number; // length of one lesson
};

export type ClubConfig = Settings & { hours: Hours[]; activities: Activity[] };

export const DEFAULTS: Settings = {
  clubName: "Oak & Feather Ranch",
  tagline: "Members' sporting club",
  shopPhone: "(555) 014-2290",
  logo: null,
  primary: "#1b2a41",
  accent: "#4a7a4c",
  timezone: "America/New_York",
  bookingDays: 14,
  maxPerDay: 2,
  cancelCutoff: "18:00",
  reservationExpiryDays: 3,
  roundMinutes: 120,
  lessonMinutes: 60,
};

export const DEFAULT_HOURS: Hours[] = Array.from({ length: 7 }, (_, weekday) => ({ weekday, open: "08:00", close: "17:00", closed: false }));

export const SLOT_MINUTES = 30;

export async function getConfig(db: Client): Promise<ClubConfig> {
  const [settingsRs, hoursRs, actRs] = await Promise.all([
    db.execute("SELECT key, value FROM settings"),
    db.execute("SELECT weekday, open, close, closed FROM hours ORDER BY weekday"),
    db.execute("SELECT key, label, mode, per_slot, sort, active FROM activities ORDER BY sort, label"),
  ]);
  const stored: Record<string, unknown> = {};
  for (const r of settingsRs.rows) {
    try {
      stored[String(r.key)] = JSON.parse(String(r.value));
    } catch {
      /* ignore a corrupt value and use the default */
    }
  }
  const settings = { ...DEFAULTS } as Record<string, unknown>;
  for (const k of Object.keys(DEFAULTS)) if (k in stored) settings[k] = stored[k];

  const hours = DEFAULT_HOURS.map((d) => {
    const row = hoursRs.rows.find((r) => Number(r.weekday) === d.weekday);
    return row ? { weekday: d.weekday, open: String(row.open), close: String(row.close), closed: Boolean(Number(row.closed)) } : d;
  });
  const activities = actRs.rows.map((r) => ({
    key: String(r.key),
    label: String(r.label),
    mode: String(r.mode) as ActivityMode,
    perSlot: r.per_slot == null ? null : Number(r.per_slot),
    sort: Number(r.sort),
    active: Boolean(Number(r.active)),
  }));
  return { ...(settings as Settings), hours, activities };
}

export async function saveSettings(db: Client, values: Partial<Settings>) {
  const entries = Object.entries(values).filter(([k]) => k in DEFAULTS);
  if (!entries.length) return;
  await db.batch(
    entries.map(([k, v]) => ({ sql: "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", args: [k, JSON.stringify(v)] })),
    "write",
  );
}

export function toMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
export function fromMinutes(n: number) {
  return `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
}

/** Weekday (0 = Sunday) of a "YYYY-MM-DD" date. */
export function weekdayOf(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

/** The bookable slot start times on a given date, from that weekday's hours. Empty if closed. */
export function slotsFor(cfg: Pick<ClubConfig, "hours">, date: string): string[] {
  const h = cfg.hours.find((x) => x.weekday === weekdayOf(date));
  if (!h || h.closed) return [];
  const out: string[] = [];
  for (let m = toMinutes(h.open); m + SLOT_MINUTES <= toMinutes(h.close); m += SLOT_MINUTES) out.push(fromMinutes(m));
  return out;
}

/** "09:00" + 90 minutes -> "10:30" */
export function addMinutes(t: string, mins: number) {
  return fromMinutes(toMinutes(t) + mins);
}

/** Every slot time used on any day, for staff forms. */
export function allSlots(cfg: Pick<ClubConfig, "hours">): string[] {
  const set = new Set<string>();
  for (const h of cfg.hours) if (!h.closed) for (let m = toMinutes(h.open); m + SLOT_MINUTES <= toMinutes(h.close); m += SLOT_MINUTES) set.add(fromMinutes(m));
  return [...set].sort();
}

export function activityFor(cfg: Pick<ClubConfig, "activities">, key: string): Activity | undefined {
  return cfg.activities.find((a) => a.key === key);
}

export function activityLabel(cfg: Pick<ClubConfig, "activities">, key: string): string {
  return cfg.activities.find((a) => a.key === key)?.label ?? key;
}

// ---- Colour helpers for the theme ----

function luminance(hex: string): number {
  const n = hex.replace("#", "");
  const rgb = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
  const lin = rgb.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

export function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** White or near-black text, whichever reads better on this background. */
export function textOn(bg: string): string {
  return contrast(bg, "#ffffff") >= contrast(bg, "#1a1a1a") ? "#ffffff" : "#1a1a1a";
}

export function isHexColor(s: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(s);
}
