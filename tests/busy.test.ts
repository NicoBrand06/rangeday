import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTables } from "../lib/schema";
import { busyByHour, busySummary } from "../lib/busy";

let db: Client;
let dir: string;
const DAY = "2026-11-21";

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "rangeday-test-"));
  db = createClient({ url: `file:${join(dir, "test.db")}` });
  await createTables(db);
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
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("busy meter", () => {
  it("measures booked share of station time per hour, ignoring cancellations", async () => {
    const hours = await busyByHour(db, DAY);
    expect(hours.map((h) => h.hour)).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16]);
    const nine = hours.find((h) => h.hour === 9)!;
    expect([nine.booked, nine.capacity, nine.pct, nine.level]).toEqual([3, 4, 75, "busy"]);
    expect(hours.find((h) => h.hour === 11)!.level).toBe("quiet"); // 1 of 4 = 25%
    expect(hours.find((h) => h.hour === 8)!.pct).toBe(0);
  });

  it("summarises the current hour and suggests the quietest time left", async () => {
    const hours = await busyByHour(db, DAY);
    expect(busySummary(hours, { date: DAY, time: "09:15" }).headline).toBe("Right now: Busy");
    expect(busySummary(hours, { date: DAY, time: "06:00" }).headline).toBe("Opens at 8 am");
    expect(busySummary(hours, { date: DAY, time: "17:30" }).headline).toBe("Closed for the day");
    expect(busySummary(hours, { date: DAY, time: "10:15" }).tip).toBe("Quietest time left today: 12 pm");
  });
});
