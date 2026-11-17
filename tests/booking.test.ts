import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Client } from "@libsql/client";
import { openTestDb } from "./setup";
import { getConfig, type ClubConfig } from "../lib/config";
import { availability, cancelBooking, createBooking, getBooking } from "../lib/booking";

// Each test gets a brand-new, empty database with 2 trap fields and 3 members.
// "now" is fixed at Monday 16 Nov 2026, 10:00 am club time.
const NOW = { date: "2026-11-16", time: "10:00" };
const SAT = "2026-11-21";
const SAM = { id: 1, role: "member" as const };
const PRIYA = { id: 2, role: "member" as const };
const JORDAN = { id: 3, role: "staff" as const };

let db: Client;
let close: () => void;
let cfg: ClubConfig;

beforeEach(async () => {
  ({ db, close } = await openTestDb());
  await db.batch(
    [
      "INSERT INTO users (id,name,member_no,role) VALUES (1,'Sam','1042','member'),(2,'Priya','1210','member'),(3,'Jordan','S-01','staff')",
      "INSERT INTO stations (id,activity,name,capacity) VALUES (1,'trap','Trap, Field 1',5),(2,'trap','Trap, Field 2',5)",
    ],
    "write",
  );
  cfg = await getConfig(db);
});

afterEach(() => close());

const book = (over: Partial<Parameters<typeof createBooking>[2]> = {}, now = NOW) =>
  createBooking(db, cfg, { userId: SAM.id, stationId: 1, date: SAT, time: "09:00", partySize: 2, ...over }, now);

describe("booking a slot", () => {
  it("books an open slot", async () => {
    const r = await book();
    expect(r.ok).toBe(true);
  });

  it("rejects slots in the past and beyond the 14-day window", async () => {
    expect((await book({ date: NOW.date, time: "09:30" })).ok).toBe(false); // earlier today
    expect((await book({ date: NOW.date, time: "10:00" })).ok).toBe(false); // starting right now
    expect((await book({ date: NOW.date, time: "10:30" })).ok).toBe(true); // later today is fine
    expect((await book({ date: "2026-11-30" })).ok).toBe(false); // 14 days out: too far
    expect((await book({ time: "07:00" })).ok).toBe(false); // not a real slot
  });
});

describe("no double-booking", () => {
  it("refuses a second booking for the same station and slot", async () => {
    expect((await book()).ok).toBe(true);
    const second = await book({ userId: PRIYA.id });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toMatch(/just booked/);
  });

  it("lets only one of two simultaneous requests win", async () => {
    const results = await Promise.all([book(), book({ userId: PRIYA.id })]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const live = await db.execute("SELECT count(*) AS n FROM bookings WHERE status != 'cancelled'");
    expect(Number(live.rows[0].n)).toBe(1);
  });

  it("allows a different station at the same time", async () => {
    expect((await book()).ok).toBe(true);
    expect((await book({ userId: PRIYA.id, stationId: 2 })).ok).toBe(true);
  });

  it("stops one member being booked on two stations at once", async () => {
    expect((await book()).ok).toBe(true);
    expect((await book({ stationId: 2 })).ok).toBe(false);
  });
});

describe("capacity", () => {
  it("enforces the station's party size limit", async () => {
    expect((await book({ partySize: 6 })).ok).toBe(false);
    expect((await book({ partySize: 0 })).ok).toBe(false);
    expect((await book({ partySize: 5 })).ok).toBe(true);
  });

  it("limits a member to 2 bookings per day", async () => {
    expect((await book({ time: "09:00" })).ok).toBe(true);
    expect((await book({ time: "10:00" })).ok).toBe(true);
    const third = await book({ time: "11:00" });
    expect(third.ok).toBe(false);
    if (!third.ok) expect(third.error).toMatch(/up to 2/);
  });

  it("shows a slot as full when every station is taken, and '1 left' before that", async () => {
    await book();
    let slot = (await availability(db, cfg, "trap", SAT, PRIYA.id, NOW)).find((s) => s.time === "09:00")!;
    expect(slot.status).toBe("few");
    expect(slot.free.map((s) => s.id)).toEqual([2]);
    await book({ userId: PRIYA.id, stationId: 2 });
    slot = (await availability(db, cfg, "trap", SAT, PRIYA.id, NOW)).find((s) => s.time === "09:00")!;
    expect(slot.status).toBe("full");
    expect(slot.mine).toBe(true);
  });
});

describe("cancellations", () => {
  it("frees the slot so someone else can book it", async () => {
    const r = await book();
    if (!r.ok) throw new Error(r.error);
    expect((await cancelBooking(db, cfg, r.id, SAM, NOW)).ok).toBe(true);
    expect((await getBooking(db, r.id))?.status).toBe("cancelled");
    expect((await book({ userId: PRIYA.id })).ok).toBe(true);
  });

  it("lets members cancel until 6 pm the day before, then sends them to the desk", async () => {
    const r = await book();
    if (!r.ok) throw new Error(r.error);
    const fridayBefore = { date: "2026-11-20", time: "17:59" };
    const fridayAfter = { date: "2026-11-20", time: "18:00" };
    const late = await cancelBooking(db, cfg, r.id, SAM, fridayAfter);
    expect(late.ok).toBe(false);
    if (!late.ok) expect(late.error).toMatch(/front desk/);
    expect((await cancelBooking(db, cfg, r.id, SAM, fridayBefore)).ok).toBe(true);
  });

  it("lets staff cancel after the member cut-off", async () => {
    const r = await book();
    if (!r.ok) throw new Error(r.error);
    expect((await cancelBooking(db, cfg, r.id, JORDAN, { date: SAT, time: "08:00" })).ok).toBe(true);
  });

  it("doesn't let members cancel someone else's booking, or cancel twice", async () => {
    const r = await book();
    if (!r.ok) throw new Error(r.error);
    expect((await cancelBooking(db, cfg, r.id, PRIYA, NOW)).ok).toBe(false);
    expect((await cancelBooking(db, cfg, r.id, SAM, NOW)).ok).toBe(true);
    expect((await cancelBooking(db, cfg, r.id, SAM, NOW)).ok).toBe(false);
  });

  it("doesn't count cancelled bookings toward the daily limit", async () => {
    const a = await book({ time: "09:00" });
    await book({ time: "10:00" });
    if (!a.ok) throw new Error(a.error);
    await cancelBooking(db, cfg, a.id, SAM, NOW);
    expect((await book({ time: "11:00" })).ok).toBe(true);
  });
});
