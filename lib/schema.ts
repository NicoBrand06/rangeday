import type { Client } from "@libsql/client";

// The data model, as numbered migrations. Each migration runs once and the
// database remembers its version, so later changes never need a wipe.
// To change the schema: ADD a new entry at the end. Never edit an old one.

const V1 = [
  `CREATE TABLE users (
     id INTEGER PRIMARY KEY,
     name TEXT NOT NULL,
     email TEXT UNIQUE COLLATE NOCASE,
     password_hash TEXT,
     member_no TEXT NOT NULL UNIQUE,
     role TEXT NOT NULL CHECK (role IN ('member','staff')),
     active INTEGER NOT NULL DEFAULT 1,
     is_demo INTEGER NOT NULL DEFAULT 0,
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   )`,
  // Only a hash of each session token is stored, so a database leak can't be used to log in.
  `CREATE TABLE sessions (
     token_hash TEXT PRIMARY KEY,
     user_id INTEGER NOT NULL REFERENCES users(id),
     expires_at TEXT NOT NULL,
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   )`,
  `CREATE TABLE login_attempts (
     email TEXT PRIMARY KEY COLLATE NOCASE,
     failures INTEGER NOT NULL DEFAULT 0,
     locked_until TEXT
   )`,
  // Club settings as key -> JSON value (name, colours, policies...).
  `CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  // Opening hours per weekday: 0 = Sunday ... 6 = Saturday.
  `CREATE TABLE hours (
     weekday INTEGER PRIMARY KEY CHECK (weekday BETWEEN 0 AND 6),
     open TEXT NOT NULL,
     close TEXT NOT NULL,
     closed INTEGER NOT NULL DEFAULT 0
   )`,
  // How an area is used (see lib/booking.ts):
  //   slot       - a field to yourself for the slot (5-Stand, trap, skeet). Can be fully booked.
  //   shared     - bookable, but everyone shares it, up to per_slot people per slot (flat range, pond, archery).
  //   walkaround - no booking, never "full" (the clays course). per_slot = people when it starts to feel busy.
  `CREATE TABLE activities (
     key TEXT PRIMARY KEY,
     label TEXT NOT NULL,
     mode TEXT NOT NULL DEFAULT 'slot' CHECK (mode IN ('slot','shared','walkaround')),
     per_slot INTEGER,
     sort INTEGER NOT NULL DEFAULT 0,
     active INTEGER NOT NULL DEFAULT 1
   )`,
  // A bookable field, or for shared and walk-around areas the one space everyone uses.
  // capacity = most people in one party.
  `CREATE TABLE stations (
     id INTEGER PRIMARY KEY,
     activity TEXT NOT NULL REFERENCES activities(key),
     name TEXT NOT NULL,
     capacity INTEGER NOT NULL,
     active INTEGER NOT NULL DEFAULT 1
   )`,
  `CREATE TABLE bookings (
     id INTEGER PRIMARY KEY,
     user_id INTEGER NOT NULL REFERENCES users(id),
     station_id INTEGER NOT NULL REFERENCES stations(id),
     date TEXT NOT NULL,
     start_time TEXT NOT NULL,
     party_size INTEGER NOT NULL,
     status TEXT NOT NULL DEFAULT 'booked'
       CHECK (status IN ('booked','checked_in','no_show','cancelled')),
     source TEXT NOT NULL DEFAULT 'app' CHECK (source IN ('app','phone')),
     shared INTEGER NOT NULL DEFAULT 0, -- 1 = in a shared area, alongside other members
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   )`,
  // The database itself refuses a second live booking for the same field and slot.
  // (Shared areas are capped by headcount in createBooking instead.)
  `CREATE UNIQUE INDEX one_booking_per_slot
     ON bookings (station_id, date, start_time) WHERE status != 'cancelled' AND shared = 0`,
  // A repeating event. rule: weekly (weekday), monthly (nth weekday), yearly (month_day "MM-DD").
  `CREATE TABLE event_series (
     id INTEGER PRIMARY KEY,
     title TEXT NOT NULL,
     category TEXT NOT NULL,
     description TEXT NOT NULL,
     location TEXT NOT NULL,
     start_time TEXT NOT NULL,
     end_time TEXT NOT NULL,
     capacity INTEGER NOT NULL,
     rule TEXT NOT NULL CHECK (rule IN ('weekly','monthly','yearly')),
     weekday INTEGER,
     nth INTEGER,
     month_day TEXT,
     starts_on TEXT NOT NULL,
     active INTEGER NOT NULL DEFAULT 1
   )`,
  `CREATE TABLE events (
     id INTEGER PRIMARY KEY,
     series_id INTEGER REFERENCES event_series(id),
     title TEXT NOT NULL,
     category TEXT NOT NULL,
     description TEXT NOT NULL,
     date TEXT NOT NULL,
     start_time TEXT NOT NULL,
     end_time TEXT NOT NULL,
     location TEXT NOT NULL,
     capacity INTEGER NOT NULL,
     cancelled INTEGER NOT NULL DEFAULT 0
   )`,
  // One occurrence per series per date, so topping up the calendar never duplicates.
  `CREATE UNIQUE INDEX one_occurrence_per_day ON events (series_id, date) WHERE series_id IS NOT NULL`,
  `CREATE TABLE rsvps (
     id INTEGER PRIMARY KEY,
     event_id INTEGER NOT NULL REFERENCES events(id),
     user_id INTEGER NOT NULL REFERENCES users(id),
     status TEXT NOT NULL DEFAULT 'going' CHECK (status IN ('going','waitlist')),
     created_at TEXT NOT NULL DEFAULT (datetime('now')),
     UNIQUE (event_id, user_id)
   )`,
  `CREATE TABLE items (
     id INTEGER PRIMARY KEY,
     name TEXT NOT NULL,
     category TEXT NOT NULL,
     detail TEXT NOT NULL,
     price_cents INTEGER NOT NULL,
     active INTEGER NOT NULL DEFAULT 1
   )`,
  `CREATE TABLE reservations (
     id INTEGER PRIMARY KEY,
     item_id INTEGER NOT NULL REFERENCES items(id),
     user_id INTEGER NOT NULL REFERENCES users(id),
     quantity INTEGER NOT NULL,
     status TEXT NOT NULL DEFAULT 'pending'
       CHECK (status IN ('pending','confirmed','declined','cancelled','picked_up','expired')),
     staff_note TEXT,
     created_at TEXT NOT NULL DEFAULT (datetime('now')),
     confirmed_at TEXT,
     updated_at TEXT NOT NULL DEFAULT (datetime('now'))
   )`,
  // Walk-around areas (the clays course) aren't booked. Instead members say when they plan
  // to come, and staff record check-ins (members' planned visits or walk-in groups).
  `CREATE TABLE visits (
     id INTEGER PRIMARY KEY,
     activity TEXT NOT NULL REFERENCES activities(key),
     user_id INTEGER REFERENCES users(id), -- NULL for a walk-in group recorded by staff
     date TEXT NOT NULL,
     time TEXT NOT NULL,                   -- planned arrival, or actual check-in time
     party_size INTEGER NOT NULL,
     kind TEXT NOT NULL CHECK (kind IN ('expected','checked_in','cancelled')),
     source TEXT NOT NULL DEFAULT 'app' CHECK (source IN ('app','desk')),
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   )`,
  `CREATE INDEX visits_by_day ON visits (activity, date)`,
  // Lessons with instructors.
  `CREATE TABLE instructors (
     id INTEGER PRIMARY KEY,
     name TEXT NOT NULL,
     specialty TEXT NOT NULL,
     disciplines TEXT NOT NULL, -- comma-separated activity keys they teach, e.g. "clays,trap"
     active INTEGER NOT NULL DEFAULT 1
   )`,
  // Weekly availability: one or more time windows per weekday.
  `CREATE TABLE instructor_hours (
     id INTEGER PRIMARY KEY,
     instructor_id INTEGER NOT NULL REFERENCES instructors(id),
     weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
     start_time TEXT NOT NULL,
     end_time TEXT NOT NULL
   )`,
  `CREATE TABLE instructor_time_off (
     instructor_id INTEGER NOT NULL REFERENCES instructors(id),
     date TEXT NOT NULL,
     reason TEXT,
     PRIMARY KEY (instructor_id, date)
   )`,
  `CREATE TABLE lessons (
     id INTEGER PRIMARY KEY,
     instructor_id INTEGER NOT NULL REFERENCES instructors(id),
     user_id INTEGER NOT NULL REFERENCES users(id),
     discipline TEXT NOT NULL,
     date TEXT NOT NULL,
     start_time TEXT NOT NULL,
     end_time TEXT NOT NULL,
     status TEXT NOT NULL DEFAULT 'booked' CHECK (status IN ('booked','cancelled','done')),
     source TEXT NOT NULL DEFAULT 'app' CHECK (source IN ('app','phone')),
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   )`,
  `CREATE INDEX lessons_by_instructor ON lessons (instructor_id, date)`,
];

// Version 2: "Let the shop know", one-way requests and problem reports from members to staff.
// Requests are a permanent log: the trigger refuses deletes, so patterns stay visible.
const V2 = [
  `CREATE TABLE shop_requests (
     id INTEGER PRIMARY KEY,
     user_id INTEGER NOT NULL REFERENCES users(id),
     activity TEXT NOT NULL,
     type TEXT NOT NULL CHECK (type IN ('equipment','help','other')),
     note TEXT NOT NULL CHECK (length(note) BETWEEN 1 AND 300),
     status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','done')),
     created_at TEXT NOT NULL DEFAULT (datetime('now')),
     started_by INTEGER REFERENCES users(id),
     started_at TEXT,
     done_by INTEGER REFERENCES users(id),
     done_at TEXT
   )`,
  `CREATE INDEX shop_requests_by_status ON shop_requests (status, created_at)`,
  `CREATE INDEX shop_requests_by_user ON shop_requests (user_id, created_at)`,
  `CREATE TRIGGER shop_requests_keep BEFORE DELETE ON shop_requests
   BEGIN SELECT RAISE(ABORT, 'Shop requests are a permanent log and cannot be deleted.'); END`,
];

export const MIGRATIONS: string[][] = [V1, V2];

// Tables from the original prototype, which kept no version number.
const PROTOTYPE_TABLES = ["reservations", "items", "rsvps", "events", "bookings", "stations", "users"];
const ALL_TABLES = [
  "shop_requests", "lessons", "instructor_time_off", "instructor_hours", "instructors", "visits",
  "reservations", "items", "rsvps", "events", "event_series", "bookings", "stations",
  "activities", "hours", "settings", "login_attempts", "sessions", "users",
];

export async function schemaVersion(db: Client): Promise<number> {
  await db.execute("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  const row = (await db.execute("SELECT value FROM meta WHERE key = 'schema_version'")).rows[0];
  return row ? Number(row.value) : 0;
}

/** Bring the database up to the latest version. Returns true if it was brand new. */
export async function migrate(db: Client): Promise<boolean> {
  const from = await schemaVersion(db);
  if (from === 0) {
    // Version 0 is either an empty database or the prototype, which only ever held demo data.
    await db.batch([...PROTOTYPE_TABLES.map((t) => `DROP TABLE IF EXISTS ${t}`), "DELETE FROM meta"], "write");
  }
  for (let v = from; v < MIGRATIONS.length; v++) {
    await db.batch(
      [...MIGRATIONS[v], { sql: "INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?)", args: [String(v + 1)] }],
      "write",
    );
  }
  return from === 0;
}

/** Wipe everything. Only ever called for demo resets and tests. */
export async function dropAll(db: Client) {
  await db.batch([...ALL_TABLES.map((t) => `DROP TABLE IF EXISTS ${t}`), "DROP TABLE IF EXISTS meta"], "write");
}
