import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Client } from "@libsql/client";
import { openTestDb } from "./setup";
import { getConfig, type ClubConfig } from "../lib/config";
import { cancelRsvp, createEvent, ensureOccurrences, getEvent, rsvp, seriesDates, setEventCancelled, signupLists, updateEvent } from "../lib/events";

const NOW = { date: "2026-11-16", time: "10:00" };
let db: Client;
let close: () => void;
let cfg: ClubConfig;

beforeEach(async () => {
  ({ db, close } = await openTestDb());
  await db.batch(
    [
      "INSERT INTO users (id,name,member_no,role) VALUES (1,'Sam','1042','member'),(2,'Priya','1210','member'),(3,'Alex','1101','member'),(4,'Dana','1102','member')",
      `INSERT INTO events (id,title,category,description,date,start_time,end_time,location,capacity)
       VALUES (1,'Clinic','Clinic','',  '2026-11-21','09:00','11:00','5-Stand',2),
              (2,'League','League','',  '2026-11-16','09:00','12:00','Clays',30)`,
    ],
    "write",
  );
  cfg = await getConfig(db);
});

afterEach(() => close());

describe("event RSVPs", () => {
  it("adds a member to the list, once", async () => {
    expect((await rsvp(db, 1, 1, NOW)).ok).toBe(true);
    expect((await rsvp(db, 1, 1, NOW)).ok).toBe(false);
    expect((await getEvent(db, 1, 1))?.going).toBe(1);
  });

  it("puts members on the waitlist once the event is full, in order", async () => {
    await rsvp(db, 1, 1, NOW);
    await rsvp(db, 1, 2, NOW);
    const third = await rsvp(db, 1, 3, NOW);
    expect(third.ok && third.status).toBe("waitlist");
    const fourth = await rsvp(db, 1, 4, NOW);
    expect(fourth.ok && fourth.status).toBe("waitlist");
    expect((await getEvent(db, 1, 4))?.my_position).toBe(2);
    expect((await getEvent(db, 1, 1))?.going).toBe(2);
  });

  it("promotes the first person on the waitlist when someone cancels", async () => {
    await rsvp(db, 1, 1, NOW);
    await rsvp(db, 1, 2, NOW);
    await rsvp(db, 1, 3, NOW);
    await rsvp(db, 1, 4, NOW);
    const r = await cancelRsvp(db, 1, 2, NOW);
    expect(r.ok && r.promoted).toEqual([3]);
    expect((await getEvent(db, 1, 3))?.mine).toBe("going");
    expect((await getEvent(db, 1, 4))?.my_position).toBe(1);
    // Leaving the waitlist doesn't promote anyone (no place opened).
    const left = await cancelRsvp(db, 1, 4, NOW);
    expect(left.ok && left.promoted).toEqual([]);
  });

  it("promotes from the waitlist when staff add places, but never past capacity", async () => {
    for (const u of [1, 2, 3, 4]) await rsvp(db, 1, u, NOW);
    const base = { title: "Clinic", category: "Clinic", description: "", date: "2026-11-21", start_time: "09:00", end_time: "11:00", location: "5-Stand" };
    const r = await updateEvent(db, 1, { ...base, capacity: 3 }, "one", NOW);
    expect(r.ok && r.promoted).toEqual([3]);
    const lists = await signupLists(db, 1);
    expect(lists.going.map((g) => g.name)).toEqual(["Sam", "Priya", "Alex"]);
    expect(lists.waitlist.map((g) => g.name)).toEqual(["Dana"]);
  });

  it("lets only one of two members take the last spot; the other is waitlisted", async () => {
    await rsvp(db, 1, 1, NOW);
    const results = await Promise.all([rsvp(db, 1, 2, NOW), rsvp(db, 1, 3, NOW)]);
    expect(results.map((r) => r.ok && r.status).sort()).toEqual(["going", "waitlist"]);
    expect((await getEvent(db, 1, 1))?.going).toBe(2);
  });

  it("refuses RSVPs to events that have started or been cancelled", async () => {
    expect((await rsvp(db, 2, 1, NOW)).ok).toBe(false); // started at 9:00 today
    await db.execute("UPDATE events SET cancelled = 1 WHERE id = 1");
    expect((await rsvp(db, 1, 1, NOW)).ok).toBe(false);
  });
});

describe("repeating events", () => {
  it("weekly, monthly (nth weekday) and yearly dates", () => {
    expect(seriesDates({ rule: "weekly", weekday: 4, nth: null, month_day: null, starts_on: "2026-11-16" }, "2026-11-16", "2026-12-03")).toEqual([
      "2026-11-19", "2026-11-26", "2026-12-03",
    ]);
    expect(seriesDates({ rule: "monthly", weekday: 6, nth: 1, month_day: null, starts_on: "2026-11-16" }, "2026-11-16", "2027-02-28")).toEqual([
      "2026-12-05", "2027-01-02", "2027-02-06",
    ]);
    expect(seriesDates({ rule: "yearly", weekday: null, nth: null, month_day: "05-15", starts_on: "2026-11-16" }, "2026-11-16", "2028-06-01")).toEqual([
      "2027-05-15", "2028-05-15",
    ]);
  });

  it("creates dates about 12 weeks ahead without duplicating them", async () => {
    const base = { title: "Sunset Clays", category: "Social", description: "", date: "2026-11-19", start_time: "17:00", end_time: "19:30", location: "Clays course", capacity: 24 };
    const r = await createEvent(db, base, "weekly", NOW);
    expect(r.ok).toBe(true);
    const count = async () => Number((await db.execute("SELECT count(*) AS n FROM events WHERE title = 'Sunset Clays'")).rows[0].n);
    const n = await count();
    expect(n).toBeGreaterThanOrEqual(12);
    await ensureOccurrences(db, NOW.date, true);
    expect(await count()).toBe(n);
  });

  it("cancelling 'this and later' stops the series", async () => {
    const base = { title: "Members Shoot", category: "Members", description: "", date: "2026-12-05", start_time: "09:00", end_time: "12:00", location: "Clays", capacity: 40 };
    const r = await createEvent(db, base, "monthly", NOW);
    if (!r.ok) throw new Error(r.error);
    const dates = (await db.execute("SELECT id, date FROM events WHERE title = 'Members Shoot' ORDER BY date")).rows;
    await setEventCancelled(db, Number(dates[1].id), true, "future");
    const after = (await db.execute("SELECT cancelled FROM events WHERE title = 'Members Shoot' ORDER BY date")).rows.map((x) => Number(x.cancelled));
    expect(after[0]).toBe(0);
    expect(after.slice(1).every((c) => c === 1)).toBe(true);
    await ensureOccurrences(db, "2027-03-01", true);
    const live = await db.execute("SELECT count(*) AS n FROM events WHERE title = 'Members Shoot' AND cancelled = 0");
    expect(Number(live.rows[0].n)).toBe(1);
  });
});
