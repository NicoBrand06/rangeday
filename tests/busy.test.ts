import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Client } from "@libsql/client";
import { openTestDb } from "./setup";
import { getConfig, type ClubConfig } from "../lib/config";
import { busyByArea, busySummary } from "../lib/busy";

let db: Client;
let close: () => void;
let cfg: ClubConfig;
const DAY = "2026-11-21";

beforeEach(async () => {
  ({ db, close } = await openTestDb());
  await db.batch(
    [
      "INSERT INTO users (id,name,member_no,role) VALUES (1,'Sam','1042','member')",
      "INSERT INTO stations (id,activity,name,capacity) VALUES (1,'trap','T1',5),(2,'trap','T2',5)",
      // 9 am hour: 2 stations x 2 half-hour slots = 4 station-slots; 3 booked + 1 cancelled
      `INSERT INTO bookings (user_id,station_id,date,start_time,party_size,status) VALUES
        (1,1,'${DAY}','09:00',1,'booked'),(1,2,'${DAY}','09:00',1,'checked_in'),
        (1,1,'${DAY}','09:30',1,'no_show'),(1,2,'${DAY}','09:30',1,'cancelled'),
        (1,1,'${DAY}','11:00',1,'booked')`,
    ],
    "write",
  );
  cfg = await getConfig(db);
});

afterEach(() => close());

const NOW = { date: DAY, time: "09:15" };
const trapHours = async () => (await busyByArea(db, cfg, DAY, NOW)).find((a) => a.activity === "trap")!.hours;

describe("busy meter", () => {
  it("measures booked share of field time per hour, ignoring cancellations", async () => {
    const hours = await trapHours();
    expect(hours.map((h) => h.hour)).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16]);
    const nine = hours.find((h) => h.hour === 9)!;
    expect([nine.booked, nine.capacity, nine.pct, nine.level]).toEqual([3, 4, 75, "busy"]);
    expect(hours.find((h) => h.hour === 11)!.level).toBe("quiet"); // 1 of 4 = 25%
    expect(hours.find((h) => h.hour === 8)!.pct).toBe(0);
  });

  it("summarises the current hour and suggests the quietest time left", async () => {
    const hours = await trapHours();
    expect(busySummary(hours, { date: DAY, time: "09:15" }).headline).toBe("Right now: Busy");
    expect(busySummary(hours, { date: DAY, time: "06:00" }).headline).toBe("Opens at 8 am");
    expect(busySummary(hours, { date: DAY, time: "17:30" }).headline).toBe("Closed for the day");
    expect(busySummary(hours, { date: DAY, time: "10:15" }).tip).toBe("Quietest time left today: 12 pm");
  });

  it("follows the club's opening hours, and shows nothing on a closed day", async () => {
    await db.execute("INSERT INTO hours (weekday, open, close, closed) VALUES (6, '10:00', '14:00', 0)");
    cfg = await getConfig(db);
    expect((await trapHours()).map((h) => h.hour)).toEqual([10, 11, 12, 13]);
    await db.execute("UPDATE hours SET closed = 1 WHERE weekday = 6");
    cfg = await getConfig(db);
    expect(await busyByArea(db, cfg, DAY, NOW)).toEqual([]);
  });
});
