import type { Client } from "@libsql/client";
import type { Result } from "./booking";
import { contrast, isHexColor, saveSettings, SLOT_MINUTES, textOn, toMinutes, type ActivityMode, type Hours, type Settings } from "./config";

// Validation and saving for the staff Settings page. Every form posts here, and every
// rule is checked on the server, so a bad value can't get in even from a hand-made request.

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const MODES: ActivityMode[] = ["slot", "shared", "walkaround"];
export const MAX_LOGO_BYTES = 200 * 1024;

export async function saveBranding(
  db: Client,
  input: { clubName: string; tagline: string; primary: string; accent: string; logo?: string | null; removeLogo?: boolean },
): Promise<Result<{ warnings: string[] }>> {
  const clubName = input.clubName.trim();
  if (clubName.length < 2 || clubName.length > 60) return { ok: false, error: "Enter the club's name (up to 60 characters)." };
  if (input.tagline.trim().length > 80) return { ok: false, error: "Keep the tagline under 80 characters." };
  if (!isHexColor(input.primary) || !isHexColor(input.accent)) return { ok: false, error: "Pick both colours." };
  const values: Partial<Settings> = { clubName, tagline: input.tagline.trim(), primary: input.primary, accent: input.accent };
  if (input.removeLogo) values.logo = null;
  else if (input.logo) values.logo = input.logo;
  await saveSettings(db, values);

  // WCAG AA asks for a 4.5:1 contrast ratio for normal text.
  const warnings: string[] = [];
  for (const [label, c] of [["Header colour", input.primary], ["Button colour", input.accent]] as const) {
    if (contrast(c, textOn(c)) < 4.5) warnings.push(`${label}: text on it may be hard to read (contrast below 4.5:1). Try a darker or lighter shade.`);
  }
  if (contrast(input.accent, "#ffffff") < 3) warnings.push("Button colour is very light on the white page background.");
  return { ok: true, warnings };
}

/** Turn an uploaded file into a data: URL after checking type and size. */
export async function logoFromFile(file: File | null): Promise<Result<{ logo: string | null }>> {
  if (!file || file.size === 0) return { ok: true, logo: null };
  if (!["image/png", "image/svg+xml", "image/jpeg", "image/webp"].includes(file.type)) return { ok: false, error: "Upload a PNG, SVG, JPG or WebP image." };
  if (file.size > MAX_LOGO_BYTES) return { ok: false, error: "That image is over 200 KB. Please upload a smaller one." };
  const bytes = Buffer.from(await file.arrayBuffer());
  if (file.type === "image/svg+xml" && /<script|on\w+\s*=|javascript:/i.test(bytes.toString("utf8")))
    return { ok: false, error: "That SVG contains scripts, which aren't allowed. Export it as a plain image." };
  return { ok: true, logo: `data:${file.type};base64,${bytes.toString("base64")}` };
}

export async function saveHours(db: Client, hours: Hours[]): Promise<Result> {
  if (hours.length !== 7) return { ok: false, error: "Set hours for every day." };
  for (const h of hours) {
    if (h.closed) continue;
    if (!TIME.test(h.open) || !TIME.test(h.close)) return { ok: false, error: "Enter opening and closing times." };
    if (toMinutes(h.open) % SLOT_MINUTES || toMinutes(h.close) % SLOT_MINUTES) return { ok: false, error: "Use times on the hour or half hour." };
    if (toMinutes(h.close) - toMinutes(h.open) < SLOT_MINUTES) return { ok: false, error: "Closing time must be after opening time." };
  }
  if (hours.every((h) => h.closed)) return { ok: false, error: "The club needs to be open at least one day." };
  await db.batch(
    hours.map((h) => ({
      sql: "INSERT OR REPLACE INTO hours (weekday, open, close, closed) VALUES (?,?,?,?)",
      args: [h.weekday, h.closed ? "08:00" : h.open, h.closed ? "17:00" : h.close, h.closed ? 1 : 0],
    })),
    "write",
  );
  return { ok: true };
}

export async function savePolicies(
  db: Client,
  p: { bookingDays: number; maxPerDay: number; cancelCutoff: string; reservationExpiryDays: number; roundMinutes: number; lessonMinutes: number; timezone: string },
): Promise<Result> {
  if (!Number.isInteger(p.bookingDays) || p.bookingDays < 1 || p.bookingDays > 60) return { ok: false, error: "Booking window must be 1 to 60 days." };
  if (!Number.isInteger(p.maxPerDay) || p.maxPerDay < 1 || p.maxPerDay > 10) return { ok: false, error: "Bookings per day must be 1 to 10." };
  if (!TIME.test(p.cancelCutoff)) return { ok: false, error: "Enter a cancellation cut-off time." };
  if (!Number.isInteger(p.reservationExpiryDays) || p.reservationExpiryDays < 1 || p.reservationExpiryDays > 30)
    return { ok: false, error: "Reservation expiry must be 1 to 30 days." };
  if (!Number.isInteger(p.roundMinutes) || p.roundMinutes < 30 || p.roundMinutes > 360 || p.roundMinutes % SLOT_MINUTES)
    return { ok: false, error: "Round length must be 30 to 360 minutes, in half hours." };
  if (![30, 45, 60, 90, 120].includes(p.lessonMinutes)) return { ok: false, error: "Pick a lesson length." };
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: p.timezone });
  } catch {
    return { ok: false, error: "That time zone isn't recognised. Use a name like America/Chicago." };
  }
  await saveSettings(db, p);
  return { ok: true };
}

export type ActivityInput = { key?: string; label: string; mode: string; perSlot: number | null; active: boolean };

export async function saveActivity(db: Client, a: ActivityInput): Promise<Result<{ key: string }>> {
  const label = a.label.trim();
  if (label.length < 2 || label.length > 40) return { ok: false, error: "Give the area a name." };
  if (!MODES.includes(a.mode as ActivityMode)) return { ok: false, error: "Pick a booking type." };
  let perSlot: number | null = null;
  if (a.mode !== "slot") {
    if (!Number.isInteger(a.perSlot) || (a.perSlot ?? 0) < 1 || (a.perSlot ?? 0) > 500)
      return { ok: false, error: a.mode === "shared" ? "Set the most people per slot (1 to 500)." : "Set when the course starts to feel busy (number of people)." };
    perSlot = a.perSlot;
  }
  if (a.key) {
    const rs = await db.execute({
      sql: "UPDATE activities SET label = ?, mode = ?, per_slot = ?, active = ? WHERE key = ?",
      args: [label, a.mode, perSlot, a.active ? 1 : 0, a.key],
    });
    if (!rs.rowsAffected) return { ok: false, error: "Area not found." };
    // Shared areas use one space everyone books; make sure it exists.
    if (a.mode !== "slot") await ensureArea(db, a.key, label);
    return { ok: true, key: a.key };
  }
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 20) || "area";
  let key = base;
  for (let i = 2; (await db.execute({ sql: "SELECT 1 FROM activities WHERE key = ?", args: [key] })).rows.length; i++) key = `${base}${i}`;
  const sort = Number((await db.execute("SELECT coalesce(max(sort), 0) + 1 AS n FROM activities")).rows[0].n);
  await db.execute({ sql: "INSERT INTO activities (key, label, mode, per_slot, sort) VALUES (?,?,?,?,?)", args: [key, label, a.mode, perSlot, sort] });
  if (a.mode !== "slot") await ensureArea(db, key, label);
  return { ok: true, key };
}

async function ensureArea(db: Client, key: string, label: string) {
  const has = await db.execute({ sql: "SELECT 1 FROM stations WHERE activity = ? AND active = 1", args: [key] });
  if (!has.rows.length) await db.execute({ sql: "INSERT INTO stations (activity, name, capacity) VALUES (?,?,5)", args: [key, label] });
}

export async function saveStation(db: Client, s: { id?: number; activity: string; name: string; capacity: number; active: boolean }): Promise<Result> {
  const name = s.name.trim();
  if (name.length < 2 || name.length > 60) return { ok: false, error: "Give the field a name." };
  if (!Number.isInteger(s.capacity) || s.capacity < 1 || s.capacity > 20) return { ok: false, error: "Party size must be 1 to 20." };
  if (s.id) {
    await db.execute({ sql: "UPDATE stations SET name = ?, capacity = ?, active = ? WHERE id = ?", args: [name, s.capacity, s.active ? 1 : 0, s.id] });
  } else {
    if (!(await db.execute({ sql: "SELECT 1 FROM activities WHERE key = ?", args: [s.activity] })).rows.length) return { ok: false, error: "Area not found." };
    await db.execute({ sql: "INSERT INTO stations (activity, name, capacity) VALUES (?,?,?)", args: [s.activity, name, s.capacity] });
  }
  return { ok: true };
}

/** Future bookings on a field, so staff are warned before retiring it. */
export async function futureBookingsOn(db: Client, stationId: number, today: string): Promise<number> {
  const rs = await db.execute({ sql: "SELECT count(*) AS n FROM bookings WHERE station_id = ? AND date >= ? AND status = 'booked'", args: [stationId, today] });
  return Number(rs.rows[0].n);
}
