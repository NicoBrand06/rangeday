import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTables } from "../lib/schema";
import { cancelRsvp, getEvent, rsvp } from "../lib/events";

const NOW = { date: "2026-11-16", time: "10:00" };
let db: Client;
let dir: string;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "rangeday-test-"));
  db = createClient({ url: `file:${join(dir, "test.db")}` });
  await createTables(db);
  await db.batch(
    [
      "INSERT INTO users (id,name,member_no,role) VALUES (1,'Sam','1042','member'),(2,'Priya','1210','member'),(3,'Alex','1101','member')",
      `INSERT INTO events (id,title,category,description,date,start_time,end_time,location,capacity)
       VALUES (1,'Clinic','Clinic','',  '2026-11-21','09:00','11:00','5-Stand',2),
              (2,'League','League','',  '2026-11-16','09:00','12:00','Clays',30)`,
    ],
    "write",
  );
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("event RSVPs", () => {
  it("adds a member to the list, once", async () => {
    expect((await rsvp(db, 1, 1, NOW)).ok).toBe(true);
    expect((await rsvp(db, 1, 1, NOW)).ok).toBe(false);
    expect((await getEvent(db, 1, 1))?.going).toBe(1);
  });

  it("refuses RSVPs once the event is full, and reopens a spot on cancel", async () => {
    await rsvp(db, 1, 1, NOW);
    await rsvp(db, 1, 2, NOW);
    const full = await rsvp(db, 1, 3, NOW);
    expect(full.ok).toBe(false);
    if (!full.ok) expect(full.error).toMatch(/full/);
    expect((await cancelRsvp(db, 1, 2, NOW)).ok).toBe(true);
    expect((await rsvp(db, 1, 3, NOW)).ok).toBe(true);
  });

  it("lets only one of two members take the last spot", async () => {
    await rsvp(db, 1, 1, NOW);
    const results = await Promise.all([rsvp(db, 1, 2, NOW), rsvp(db, 1, 3, NOW)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect((await getEvent(db, 1, 1))?.going).toBe(2);
  });

  it("refuses RSVPs to events that have started or been cancelled", async () => {
    expect((await rsvp(db, 2, 1, NOW)).ok).toBe(false); // started at 9:00 today
    await db.execute("UPDATE events SET cancelled = 1 WHERE id = 1");
    expect((await rsvp(db, 1, 1, NOW)).ok).toBe(false);
  });
});
