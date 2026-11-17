import { createClient, type Client } from "@libsql/client";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "../lib/schema";

/**
 * A brand-new, empty database in a temp folder, with the latest schema and one
 * slot-booked area ("trap"). Club settings fall back to the defaults:
 * open 8 am to 5 pm every day, 14-day booking window, 2 bookings a day, 6 pm cut-off.
 */
export async function openTestDb(): Promise<{ db: Client; close: () => void }> {
  const dir = mkdtempSync(join(tmpdir(), "rangeday-test-"));
  const db = createClient({ url: `file:${join(dir, "test.db")}` });
  await migrate(db);
  await db.execute("INSERT INTO activities (key, label, mode) VALUES ('trap', 'Trap', 'slot')");
  return {
    db,
    close: () => {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
