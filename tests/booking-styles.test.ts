import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "../lib/schema";
import { seedClub } from "../lib/seed";
import { getConfig, type ClubConfig } from "../lib/config";
import { availability, createBooking } from "../lib/booking";
import { busyByArea, clubWide } from "../lib/busy";
import { cancelVisit, checkInVisit, peopleOnCourse, planVisit, recordWalkIn, undoCheckIn } from "../lib/visits";

// The three booking types, using the default Oak & Feather setup:
//   slot-booked (trap: a field to yourself), shared (flat range: up to 5 people per slot),
//   walk-around (sporting clays: no booking, never full, just busier or quieter).
const NOW = { date: "2026-11-16", time: "10:00" };
const SAT = "2026-11-21";

let db: Client;
let dir: string;
let cfg: ClubConfig;
const station: Record<string, number> = {};

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "rangeday-test-"));
  db = createClient({ url: `file:${join(dir, "test.db")}` });
  await migrate(db);
  await seedClub(db, NOW.date);
  cfg = await getConfig(db);
  for (const r of (await db.execute("SELECT id, name FROM stations")).rows) station[String(r.name)] = Number(r.id);
  const users = Array.from({ length: 40 }, (_, i) => `(${i + 1},'Member ${i + 1}','${2000 + i}','member')`).join(",");
  await db.execute(`INSERT INTO users (id,name,member_no,role) VALUES ${users}`);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const book = (userId: number, name: string, partySize: number, time = "09:00") =>
  createBooking(db, cfg, { userId, stationId: station[name], date: SAT, time, partySize }, NOW);

describe("slot-booked (trap, skeet, 5-Stand)", () => {
  it("gives each party its own field: a second party can't take the same field and time", async () => {
    expect((await book(1, "Trap, Field 1", 2)).ok).toBe(true);
    const r = await book(2, "Trap, Field 1", 1);
    expect(r.ok).toBe(false);
    expect((await book(2, "Trap, Field 2", 1)).ok).toBe(true);
    const slot = (await availability(db, cfg, "trap", SAT, 3, NOW)).find((s) => s.time === "09:00")!;
    expect(slot.status).toBe("full");
    expect(slot.free).toHaveLength(0);
  });

  it("two members tapping Confirm on the same field at the same instant: only one gets it", async () => {
    const results = await Promise.all([book(1, "Skeet, Field 1", 1), book(2, "Skeet, Field 1", 1)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  it("limits the party to the field's capacity", async () => {
    expect((await book(1, "5-Stand, Field 1", 6)).ok).toBe(false);
    expect((await book(1, "5-Stand, Field 1", 5)).ok).toBe(true);
  });
});

describe("shared areas (flat range, fishing pond, archery)", () => {
  it('lets several members book the same time, up to 5 people in total, and shows "x of 5"', async () => {
    expect((await book(1, "Flat range", 2)).ok).toBe(true);
    expect((await book(2, "Flat range", 2)).ok).toBe(true);
    const slot = (await availability(db, cfg, "flat", SAT, 3, NOW)).find((s) => s.time === "09:00")!;
    expect(slot.people).toBe(4);
    expect(slot.limit).toBe(5);
    expect(slot.spotsLeft).toBe(1);
    expect(slot.status).toBe("few");

    const tooMany = await book(3, "Flat range", 2);
    expect(tooMany.ok).toBe(false);
    if (!tooMany.ok) expect(tooMany.error).toMatch(/Only 1 place is left/);
    expect((await book(3, "Flat range", 1)).ok).toBe(true);

    const full = await book(4, "Flat range", 1);
    expect(full.ok).toBe(false);
    if (!full.ok) expect(full.error).toMatch(/full/);
  });

  it("never goes over the limit even when many members book at the same instant", async () => {
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => book(i + 1, "Fishing pond", 1, "11:00")));
    expect(results.filter((r) => r.ok)).toHaveLength(5);
    const n = await db.execute({ sql: "SELECT sum(party_size) AS n FROM bookings WHERE station_id = ? AND status != 'cancelled'", args: [station["Fishing pond"]] });
    expect(Number(n.rows[0].n)).toBe(5);
  });

  it("each area has its own limit, and the limit is configurable", async () => {
    expect((await book(1, "Archery range", 5)).ok).toBe(true);
    expect((await book(2, "Flat range", 5)).ok).toBe(true);
    await db.execute("UPDATE activities SET per_slot = 8 WHERE key = 'pond'");
    cfg = await getConfig(db);
    expect((await book(3, "Fishing pond", 5)).ok).toBe(true);
    expect((await book(4, "Fishing pond", 3)).ok).toBe(true);
    expect((await book(5, "Fishing pond", 1)).ok).toBe(false);
  });
});

describe("walk-around (sporting clays course)", () => {
  const plan = (userId: number, time: string, partySize = 2, date = SAT) =>
    planVisit(db, cfg, { userId, activity: "clays", date, time, partySize }, NOW);

  it("can't be booked: it's walk-around", async () => {
    const r = await book(1, "Sporting clays course (15 stations)", 2);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/walk-around/);
    expect(await availability(db, cfg, "clays", SAT, 1, NOW)).toEqual([]);
  });

  it("planned visits have no limit and the course is never full", async () => {
    for (let u = 1; u <= 30; u++) expect((await plan(u, "09:00", 4)).ok).toBe(true); // 120 people
    const nine = (await peopleOnCourse(db, cfg, "clays", SAT, NOW)).find((s) => s.time === "09:00")!;
    expect(nine.people).toBe(120);
  });

  it("one planned visit per member per day; it can be cancelled", async () => {
    const first = await plan(1, "09:00");
    expect((await plan(1, "13:00")).ok).toBe(false);
    if (!first.ok) throw new Error(first.error);
    expect((await cancelVisit(db, first.id, 1)).ok).toBe(true);
    expect((await plan(1, "13:00")).ok).toBe(true);
    expect((await cancelVisit(db, first.id, 2)).ok).toBe(false); // not yours / already cancelled
  });

  it("a check-in counts as on the course for one round (2 hours)", async () => {
    const today = { date: NOW.date, time: "10:00" };
    await recordWalkIn(db, cfg, "clays", 4, today);
    const course = await peopleOnCourse(db, cfg, "clays", NOW.date, { date: NOW.date, time: "13:00" });
    const at = (t: string) => course.find((c) => c.time === t)!.people;
    expect(at("09:30")).toBe(0);
    expect(at("10:00")).toBe(4);
    expect(at("11:30")).toBe(4);
    expect(at("12:00")).toBe(0);
  });

  it("counts expected visitors for times ahead, but drops planned visits that never checked in", async () => {
    const r1 = await planVisit(db, cfg, { userId: 1, activity: "clays", date: NOW.date, time: "11:00", partySize: 3 }, NOW);
    await planVisit(db, cfg, { userId: 2, activity: "clays", date: NOW.date, time: "11:00", partySize: 2 }, NOW);
    let course = await peopleOnCourse(db, cfg, "clays", NOW.date, NOW);
    expect(course.find((c) => c.time === "11:00")!.people).toBe(5); // both expected

    // Member 1 arrives and checks in at 11:05; member 2 never shows. Now it's 2 pm.
    if (!r1.ok) throw new Error(r1.error);
    expect((await checkInVisit(db, r1.id, { date: NOW.date, time: "11:05" })).ok).toBe(true);
    course = await peopleOnCourse(db, cfg, "clays", NOW.date, { date: NOW.date, time: "14:00" });
    expect(course.find((c) => c.time === "11:30")!.people).toBe(3);
  });

  it("staff can undo a mistaken check-in", async () => {
    const w = await recordWalkIn(db, cfg, "clays", 3, NOW);
    if (!w.ok) throw new Error(w.error);
    expect((await undoCheckIn(db, w.id)).ok).toBe(true);
    expect((await peopleOnCourse(db, cfg, "clays", NOW.date, NOW)).every((c) => c.people === 0)).toBe(true);
  });
});

describe("busyness meter, per area", () => {
  it("measures each type its own way: fields, people out of the limit, people on the course", async () => {
    await book(1, "Trap, Field 1", 1); // 1 of 2 trap fields at 9:00 -> 1 of 4 field-slots in the 9 am hour
    await book(2, "Flat range", 5); // 5 of 5 at 9:00 -> 5 of 10 people-slots
    for (let u = 3; u <= 10; u++) await planVisit(db, cfg, { userId: u, activity: "clays", date: SAT, time: "09:00", partySize: 4 }, NOW); // 32 people
    const areas = await busyByArea(db, cfg, SAT, NOW);
    const area = (k: string) => areas.find((a) => a.activity === k)!.hours.find((h) => h.hour === 9)!;
    expect(area("trap").pct).toBe(25);
    expect(area("trap").level).toBe("quiet");
    expect(area("flat").pct).toBe(50);
    expect(area("flat").level).toBe("moderate");
    expect(area("clays").booked).toBe(32);
    expect(area("clays").level).toBe("busy");
    expect(area("skeet").pct).toBe(0);
    // A round lasts 2 hours, so the clays course is still busy at 10 am.
    expect(areas.find((a) => a.activity === "clays")!.hours.find((h) => h.hour === 10)!.level).toBe("busy");
    expect(clubWide(areas).find((h) => h.hour === 9)!.pct).toBeGreaterThan(0);
  });

  it("has a level for every active area, and nothing on a closed day", async () => {
    expect((await busyByArea(db, cfg, SAT, NOW)).map((a) => a.activity).sort()).toEqual(
      ["archery", "clays", "fivestand", "flat", "pond", "skeet", "trap"],
    );
    await db.execute("UPDATE hours SET closed = 1 WHERE weekday = 6");
    cfg = await getConfig(db);
    expect(await busyByArea(db, cfg, SAT, NOW)).toEqual([]);
  });
});
