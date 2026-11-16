import type { Client } from "@libsql/client";

// The whole data model. One table per thing the club deals with.
export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
     id INTEGER PRIMARY KEY,
     name TEXT NOT NULL,
     member_no TEXT NOT NULL UNIQUE,
     role TEXT NOT NULL CHECK (role IN ('member','staff'))
   )`,
  // A bookable lane, field or station. capacity = most shooters in one party.
  `CREATE TABLE IF NOT EXISTS stations (
     id INTEGER PRIMARY KEY,
     activity TEXT NOT NULL,
     name TEXT NOT NULL,
     capacity INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS bookings (
     id INTEGER PRIMARY KEY,
     user_id INTEGER NOT NULL REFERENCES users(id),
     station_id INTEGER NOT NULL REFERENCES stations(id),
     date TEXT NOT NULL,
     start_time TEXT NOT NULL,
     party_size INTEGER NOT NULL,
     status TEXT NOT NULL DEFAULT 'booked'
       CHECK (status IN ('booked','checked_in','no_show','cancelled')),
     source TEXT NOT NULL DEFAULT 'app' CHECK (source IN ('app','phone')),
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   )`,
  // The database itself refuses a second live booking for the same station and slot.
  // This is the last line of defence against double-booking, even if two people
  // press "Confirm" at the same moment.
  `CREATE UNIQUE INDEX IF NOT EXISTS one_booking_per_slot
     ON bookings (station_id, date, start_time) WHERE status != 'cancelled'`,
  `CREATE TABLE IF NOT EXISTS events (
     id INTEGER PRIMARY KEY,
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
  `CREATE TABLE IF NOT EXISTS rsvps (
     id INTEGER PRIMARY KEY,
     event_id INTEGER NOT NULL REFERENCES events(id),
     user_id INTEGER NOT NULL REFERENCES users(id),
     created_at TEXT NOT NULL DEFAULT (datetime('now')),
     UNIQUE (event_id, user_id)
   )`,
  `CREATE TABLE IF NOT EXISTS items (
     id INTEGER PRIMARY KEY,
     name TEXT NOT NULL,
     category TEXT NOT NULL,
     detail TEXT NOT NULL,
     price_cents INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS reservations (
     id INTEGER PRIMARY KEY,
     item_id INTEGER NOT NULL REFERENCES items(id),
     user_id INTEGER NOT NULL REFERENCES users(id),
     quantity INTEGER NOT NULL,
     status TEXT NOT NULL DEFAULT 'pending'
       CHECK (status IN ('pending','confirmed','declined','cancelled','picked_up')),
     staff_note TEXT,
     created_at TEXT NOT NULL DEFAULT (datetime('now')),
     updated_at TEXT NOT NULL DEFAULT (datetime('now'))
   )`,
  `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
];

export const TABLES = ["reservations", "items", "rsvps", "events", "bookings", "stations", "users", "meta"];

export async function createTables(db: Client) {
  await db.batch(SCHEMA, "write");
}

export async function dropTables(db: Client) {
  await db.batch(TABLES.map((t) => `DROP TABLE IF EXISTS ${t}`), "write");
}
