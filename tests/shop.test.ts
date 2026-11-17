import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Client } from "@libsql/client";
import { openTestDb } from "./setup";
import { getConfig, type ClubConfig } from "../lib/config";
import { cancelReservation, getReservation, reservationsFor, reserveItem, setItemActive, staffUpdateReservation } from "../lib/shop";

let db: Client;
let close: () => void;
let cfg: ClubConfig;

beforeEach(async () => {
  ({ db, close } = await openTestDb());
  await db.batch(
    [
      "INSERT INTO users (id,name,member_no,role) VALUES (1,'Sam','1042','member'),(2,'Priya','1210','member')",
      "INSERT INTO items (id,name,category,detail,price_cents) VALUES (1,'12 ga','Ammunition','Box of 25',1199)",
    ],
    "write",
  );
  cfg = await getConfig(db);
});

afterEach(() => close());

const reserve = async (user = 1, qty = 2) => {
  const r = await reserveItem(db, user, 1, qty);
  if (!r.ok) throw new Error(r.error);
  return r.id;
};

describe("reserve for pickup", () => {
  it("starts as pending, then staff confirm and the member sees it", async () => {
    const id = await reserve();
    expect((await getReservation(db, id))?.status).toBe("pending");
    expect((await staffUpdateReservation(db, cfg, id, "confirmed", "On the shelf behind the counter")).ok).toBe(true);
    const r = await getReservation(db, id);
    expect(r?.status).toBe("confirmed");
    expect(r?.staff_note).toBe("On the shelf behind the counter");
    expect((await staffUpdateReservation(db, cfg, id, "picked_up")).ok).toBe(true);
  });

  it("lets staff decline with a reason, and a declined request can't be confirmed later", async () => {
    const id = await reserve();
    expect((await staffUpdateReservation(db, cfg, id, "declined", "Sold out until Dec 2")).ok).toBe(true);
    expect((await staffUpdateReservation(db, cfg, id, "confirmed")).ok).toBe(false);
  });

  it("can't be marked picked up before it's confirmed", async () => {
    const id = await reserve();
    expect((await staffUpdateReservation(db, cfg, id, "picked_up")).ok).toBe(false);
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

describe("expiry and hidden items", () => {
  const ageBy = (id: number, col: "created_at" | "confirmed_at", days: number) =>
    db.execute({ sql: `UPDATE reservations SET ${col} = datetime('now', ?) WHERE id = ?`, args: [`-${days} days`, id] });

  it("an unanswered request expires after the set number of days", async () => {
    const r = { id: await reserve() };
    await ageBy(r.id, "created_at", 2);
    expect((await reservationsFor(db, cfg, 1))[0].status).toBe("pending"); // 2 of 3 days
    await ageBy(r.id, "created_at", 4);
    expect((await reservationsFor(db, cfg, 1))[0].status).toBe("expired");
    expect((await staffUpdateReservation(db, cfg, r.id, "confirmed")).ok).toBe(false);
  });

  it("a confirmed hold expires X days after confirmation, not after the request", async () => {
    const r = { id: await reserve() };
    await ageBy(r.id, "created_at", 1);
    await staffUpdateReservation(db, cfg, r.id, "confirmed");
    await ageBy(r.id, "created_at", 10);
    expect((await reservationsFor(db, cfg, 1))[0].status).toBe("confirmed"); // confirmed just now
    await ageBy(r.id, "confirmed_at", 4);
    expect((await reservationsFor(db, cfg, 1))[0].status).toBe("expired");
  });

  it("hidden items can't be reserved", async () => {
    await setItemActive(db, 1, false);
    expect((await reserveItem(db, 1, 1, 1)).ok).toBe(false);
  });
});
