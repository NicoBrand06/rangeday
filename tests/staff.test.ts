import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Client } from "@libsql/client";
import { openTestDb } from "./setup";
import { getConfig, type ClubConfig } from "../lib/config";
import { cancelBooking, createBooking, getBooking } from "../lib/booking";
import { setAttendance } from "../lib/staff";
import { rsvp, updateEvent } from "../lib/events";

const TODAY = "2026-11-21";
const at = (time: string) => ({ date: TODAY, time });
let db: Client;
let close: () => void;
let cfg: ClubConfig;

beforeEach(async () => {
  ({ db, close } = await openTestDb());
  await db.batch(
    [
      "INSERT INTO users (id,name,member_no,role) VALUES (1,'Sam','1042','member'),(2,'Priya','1210','member'),(3,'Jordan','S-01','staff')",
      "INSERT INTO stations (id,activity,name,capacity) VALUES (1,'trap','Trap, Field 1',5)",
      `INSERT INTO events (id,title,category,description,date,start_time,end_time,location,capacity)
       VALUES (1,'Clinic','Clinic','','2026-11-28','09:00','11:00','5-Stand',5)`,
    ],
    "write",
  );
  cfg = await getConfig(db);
});

afterEach(() => close());

describe("front desk", () => {
  it("phone bookings follow the same no-double-booking rule as the app", async () => {
    const app = await createBooking(db, cfg, { userId: 1, stationId: 1, date: TODAY, time: "11:00", partySize: 2 }, at("08:00"));
    const phone = await createBooking(db, cfg, { userId: 2, stationId: 1, date: TODAY, time: "11:00", partySize: 2, source: "phone" }, at("08:05"));
    expect(app.ok).toBe(true);
    expect(phone.ok).toBe(false);
  });

  it("records check-ins and no-shows at the right time, with undo", async () => {
    const r = await createBooking(db, cfg, { userId: 1, stationId: 1, date: TODAY, time: "10:00", partySize: 1 }, at("08:00"));
    if (!r.ok) throw new Error(r.error);
    expect((await setAttendance(db, r.id, "no_show", at("09:45"))).ok).toBe(false); // not started yet
    expect((await setAttendance(db, r.id, "checked_in", at("09:45"))).ok).toBe(true); // early arrival is fine
    expect((await setAttendance(db, r.id, "no_show", at("10:05"))).ok).toBe(false); // already recorded
    expect((await setAttendance(db, r.id, "booked", at("10:05"))).ok).toBe(true); // undo
    expect((await setAttendance(db, r.id, "no_show", at("10:05"))).ok).toBe(true);
    expect((await getBooking(db, r.id))?.status).toBe("no_show");
  });

  it("only checks members in on the day of the booking", async () => {
    const r = await createBooking(db, cfg, { userId: 1, stationId: 1, date: "2026-11-22", time: "10:00", partySize: 1 }, at("08:00"));
    if (!r.ok) throw new Error(r.error);
    expect((await setAttendance(db, r.id, "checked_in", at("12:00"))).ok).toBe(false);
  });

  it("can't check in a cancelled booking", async () => {
    const r = await createBooking(db, cfg, { userId: 1, stationId: 1, date: TODAY, time: "10:00", partySize: 1 }, at("08:00"));
    if (!r.ok) throw new Error(r.error);
    await cancelBooking(db, cfg, r.id, { id: 3, role: "staff" }, at("08:30"));
    expect((await setAttendance(db, r.id, "checked_in", at("09:55"))).ok).toBe(false);
  });

  it("won't shrink an event below the number already going", async () => {
    await rsvp(db, 1, 1, at("08:00"));
    await rsvp(db, 1, 2, at("08:00"));
    const base = { title: "Clinic", category: "Clinic", description: "", date: "2026-11-28", start_time: "09:00", end_time: "11:00", location: "5-Stand" };
    expect((await updateEvent(db, 1, { ...base, capacity: 1 }, "one", at("08:00"))).ok).toBe(false);
    expect((await updateEvent(db, 1, { ...base, capacity: 2 }, "one", at("08:00"))).ok).toBe(true);
    expect((await updateEvent(db, 1, { ...base, capacity: 2, end_time: "08:00" }, "one", at("08:00"))).ok).toBe(false);
  });
});
