import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTables } from "../lib/schema";
import { cancelReservation, getReservation, reserveItem, staffUpdateReservation } from "../lib/shop";

let db: Client;
let dir: string;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "rangeday-test-"));
  db = createClient({ url: `file:${join(dir, "test.db")}` });
  await createTables(db);
  await db.batch(
    [
      "INSERT INTO users (id,name,member_no,role) VALUES (1,'Sam','1042','member'),(2,'Priya','1210','member')",
      "INSERT INTO items (id,name,category,detail,price_cents) VALUES (1,'12 ga','Ammunition','Box of 25',1199)",
    ],
    "write",
  );
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const reserve = async (user = 1, qty = 2) => {
  const r = await reserveItem(db, user, 1, qty);
  if (!r.ok) throw new Error(r.error);
  return r.id;
};

describe("reserve for pickup", () => {
  it("starts as pending, then staff confirm and the member sees it", async () => {
    const id = await reserve();
    expect((await getReservation(db, id))?.status).toBe("pending");
    expect((await staffUpdateReservation(db, id, "confirmed", "On the shelf behind the counter")).ok).toBe(true);
    const r = await getReservation(db, id);
    expect(r?.status).toBe("confirmed");
    expect(r?.staff_note).toBe("On the shelf behind the counter");
    expect((await staffUpdateReservation(db, id, "picked_up")).ok).toBe(true);
  });

  it("lets staff decline with a reason, and a declined request can't be confirmed later", async () => {
    const id = await reserve();
    expect((await staffUpdateReservation(db, id, "declined", "Sold out until Dec 2")).ok).toBe(true);
    expect((await staffUpdateReservation(db, id, "confirmed")).ok).toBe(false);
  });

  it("can't be marked picked up before it's confirmed", async () => {
    const id = await reserve();
    expect((await staffUpdateReservation(db, id, "picked_up")).ok).toBe(false);
  });

  it("rejects bad quantities and duplicate holds on the same item", async () => {
    expect((await reserveItem(db, 1, 1, 0)).ok).toBe(false);
    expect((await reserveItem(db, 1, 1, 11)).ok).toBe(false);
    await reserve();
    expect((await reserveItem(db, 1, 1, 1)).ok).toBe(false);
    expect((await reserveItem(db, 2, 1, 1)).ok).toBe(true); // a different member is fine
  });

  it("lets members cancel their own open reservation, then reserve again", async () => {
    const id = await reserve();
    expect((await cancelReservation(db, id, 2)).ok).toBe(false); // not Priya's
    expect((await cancelReservation(db, id, 1)).ok).toBe(true);
    expect((await cancelReservation(db, id, 1)).ok).toBe(false);
    expect((await reserveItem(db, 1, 1, 1)).ok).toBe(true);
  });
});
