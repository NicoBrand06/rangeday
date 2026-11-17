import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "../lib/schema";
import { seedClub } from "../lib/seed";
import { getConfig, type ClubConfig } from "../lib/config";
import {
  availableInstructors, blockDay, bookLesson, cancelLesson, memberLessons, openTimes,
  saveInstructor, setInstructorActive, setWeeklyHours, unblockDay,
} from "../lib/lessons";

// Uses the seeded instructors. Dale Whitcomb (id 1) teaches clays, trap and 5-Stand:
// Tue 9-12 and 1-5 pm, Thu 9-3, Sat 8 am-1 pm. Lessons are 1 hour.
// "now" is Monday 16 Nov 2026, 10:00 am.
const NOW = { date: "2026-11-16", time: "10:00" };
const TUE = "2026-11-17";
const SAT = "2026-11-21";
const DALE = 1;
const ROSA = 2;

let db: Client;
let dir: string;
let cfg: ClubConfig;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "rangeday-test-"));
  db = createClient({ url: `file:${join(dir, "test.db")}` });
  await migrate(db);
  await seedClub(db, NOW.date);
  cfg = await getConfig(db);
  await db.execute("INSERT INTO users (id,name,member_no,role) VALUES (1,'Sam','1042','member'),(2,'Priya','1210','member'),(3,'Jordan','S-01','staff')");
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const book = (userId: number, time: string, date = SAT, instructorId = DALE, discipline = "clays") =>
  bookLesson(db, cfg, { instructorId, userId, discipline, date, time }, NOW);

describe("instructor availability", () => {
  it("open times come from weekly hours, on the half hour, with room for a full lesson", async () => {
    const times = await openTimes(db, cfg, DALE, TUE, NOW);
    expect(times[0]).toBe("09:00");
    expect(times).toContain("11:00"); // 11:00-12:00 fits the morning window
    expect(times).not.toContain("11:30"); // would run past 12:00
    expect(times).not.toContain("12:00"); // lunch break
    expect(times).toContain("13:00");
    expect(times[times.length - 1]).toBe("16:00"); // last lesson ends at 5 pm closing
  });

  it("shows nothing on a day they don't work", async () => {
    expect(await openTimes(db, cfg, DALE, "2026-11-18", NOW)).toEqual([]); // Wednesday
  });

  it("a blocked day off removes the day, and unblocking brings it back", async () => {
    const r = await blockDay(db, DALE, SAT, "Away at a competition", NOW);
    expect(r.ok).toBe(true);
    expect(await openTimes(db, cfg, DALE, SAT, NOW)).toEqual([]);
    expect((await availableInstructors(db, cfg, "clays", SAT, NOW)).map((a) => a.instructor.id)).not.toContain(DALE);
    await unblockDay(db, DALE, SAT);
    expect((await openTimes(db, cfg, DALE, SAT, NOW)).length).toBeGreaterThan(0);
  });

  it("warns staff about lessons already booked on a day they block", async () => {
    await book(1, "09:00");
    const r = await blockDay(db, DALE, SAT, "", NOW);
    expect(r.ok && r.affected.map((l) => l.member_name)).toEqual(["Sam"]);
  });

  it("a booked hour disappears, and so do the overlapping half hours either side", async () => {
    expect((await book(1, "10:00")).ok).toBe(true);
    const times = await openTimes(db, cfg, DALE, SAT, NOW);
    expect(times).not.toContain("09:30");
    expect(times).not.toContain("10:00");
    expect(times).not.toContain("10:30");
    expect(times).toContain("09:00");
    expect(times).toContain("11:00");
  });

  it("hides times that have already passed today", async () => {
    await setWeeklyHours(db, DALE, [{ weekday: 1, start_time: "08:00", end_time: "14:00" }]); // Mondays
    const times = await openTimes(db, cfg, DALE, NOW.date, NOW);
    expect(times[0]).toBe("10:30");
  });

  it("lists only active instructors who teach the discipline and work that day", async () => {
    const clays = await availableInstructors(db, cfg, "clays", SAT, NOW);
    expect(clays.map((a) => a.instructor.name).sort()).toEqual(["Dale Whitcomb", "Marcus Bell"]);
    expect((await availableInstructors(db, cfg, "archery", SAT, NOW)).map((a) => a.instructor.id)).toEqual([ROSA]);
    await setInstructorActive(db, DALE, false);
    expect((await availableInstructors(db, cfg, "clays", SAT, NOW)).map((a) => a.instructor.name)).toEqual(["Marcus Bell"]);
    expect((await book(1, "09:00")).ok).toBe(false);
  });

  it("validates weekly hours", async () => {
    expect((await setWeeklyHours(db, DALE, [{ weekday: 2, start_time: "12:00", end_time: "09:00" }])).ok).toBe(false);
    expect((await setWeeklyHours(db, DALE, [{ weekday: 2, start_time: "09:15", end_time: "10:00" }])).ok).toBe(false);
    expect(
      (await setWeeklyHours(db, DALE, [
        { weekday: 2, start_time: "09:00", end_time: "12:00" },
        { weekday: 2, start_time: "11:00", end_time: "14:00" },
      ])).ok,
    ).toBe(false);
  });
});

describe("booking a lesson", () => {
  it("never double-books an instructor, even for overlapping start times", async () => {
    expect((await book(1, "10:00")).ok).toBe(true);
    const r = await book(2, "10:30");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/isn't free/);
  });

  it("two members racing for the same time: only one wins", async () => {
    const results = await Promise.all([book(1, "11:00"), book(2, "11:00")]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const n = await db.execute("SELECT count(*) AS n FROM lessons WHERE status = 'booked'");
    expect(Number(n.rows[0].n)).toBe(1);
  });

  it("a member can't be in two overlapping lessons with different instructors", async () => {
    expect((await book(1, "09:00", SAT, DALE, "clays")).ok).toBe(true);
    const r = await book(1, "09:30", SAT, ROSA, "archery");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/already have a lesson/);
  });

  it("refuses a discipline the instructor doesn't teach, or a time outside their hours", async () => {
    expect((await book(1, "09:00", SAT, DALE, "archery")).ok).toBe(false);
    expect((await book(1, "14:00")).ok).toBe(false); // Dale finishes at 1 pm on Saturdays
  });

  it("cancelling frees the time; members must cancel before the cut-off", async () => {
    const r = await book(1, "09:00");
    if (!r.ok) throw new Error(r.error);
    expect((await cancelLesson(db, cfg, r.id, { id: 2, role: "member" }, NOW)).ok).toBe(false); // not Priya's
    expect((await cancelLesson(db, cfg, r.id, { id: 1, role: "member" }, { date: "2026-11-20", time: "19:00" })).ok).toBe(false); // past 6 pm cut-off
    expect((await cancelLesson(db, cfg, r.id, { id: 1, role: "member" }, NOW)).ok).toBe(true);
    expect(await openTimes(db, cfg, DALE, SAT, NOW)).toContain("09:00");
    expect((await memberLessons(db, 1, NOW)).upcoming).toHaveLength(0);
  });

  it("staff can add an instructor and set their week", async () => {
    const r = await saveInstructor(db, cfg, { name: "Test Coach", specialty: "Pond fishing basics", disciplines: ["pond", "nonsense"] });
    if (!r.ok) throw new Error(r.error);
    await setWeeklyHours(db, r.id, [{ weekday: 6, start_time: "14:00", end_time: "16:00" }]);
    const pond = await availableInstructors(db, cfg, "pond", SAT, NOW);
    expect(pond.map((p) => p.times)).toEqual([["14:00", "14:30", "15:00"]]);
    expect((await saveInstructor(db, cfg, { name: "X", specialty: "", disciplines: [] })).ok).toBe(false);
  });
});
