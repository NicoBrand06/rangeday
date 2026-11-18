import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Client } from "@libsql/client";
import { getConfig, type ClubConfig } from "../lib/config";
import { MIGRATIONS, migrate, schemaVersion } from "../lib/schema";
import { MAX_NOTE, MAX_OPEN_PER_MEMBER, createRequest, memberRequests, requestCounts, requestQueue, setRequestStatus } from "../lib/requests";
import { saveBranding, isPhone } from "../lib/admin";
import { openTestDb } from "./setup";

let db: Client;
let close: () => void;
let cfg: ClubConfig;
const SAM = 1;
const PRIYA = 2;
const JORDAN = 3; // staff

beforeEach(async () => {
  ({ db, close } = await openTestDb());
  await db.execute("INSERT INTO activities (key, label, mode, per_slot) VALUES ('flat', 'Flat range', 'shared', 5), ('old', 'Old area', 'slot', NULL)");
  await db.execute("UPDATE activities SET active = 0 WHERE key = 'old'");
  await db.execute("INSERT INTO users (id,name,member_no,role) VALUES (1,'Sam','1042','member'),(2,'Priya','1210','member'),(3,'Jordan','S-01','staff')");
  cfg = await getConfig(db);
});
afterEach(() => close());

const send = (note: string, over: Partial<{ userId: number; activity: string; type: string }> = {}) =>
  createRequest(db, cfg, { userId: SAM, activity: "trap", type: "equipment", note, ...over });

describe("sending a request", () => {
  it("saves a valid request as Open, tidying the note", async () => {
    const r = await send("  Trap launcher   is out of clays ");
    expect(r.ok).toBe(true);
    const [mine] = await memberRequests(db, SAM);
    expect(mine).toMatchObject({ status: "open", note: "Trap launcher is out of clays", activity: "trap", type: "equipment", member_name: "Sam" });
  });

  it("needs a note, and keeps it short", async () => {
    expect((await send("   ")).ok).toBe(false);
    expect((await send("x".repeat(MAX_NOTE))).ok).toBe(true);
    const r = await send("x".repeat(MAX_NOTE + 1));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/300 characters/);
  });

  it("only accepts real, active areas and the three types", async () => {
    expect((await send("hi", { activity: "nowhere" })).ok).toBe(false);
    expect((await send("hi", { activity: "old" })).ok).toBe(false); // retired area
    expect((await send("hi", { type: "chat" })).ok).toBe(false);
    for (const type of ["equipment", "help", "other"]) expect((await send("hi", { type, activity: "flat" })).ok).toBe(true);
  });

  it("limits how many unfinished requests one member can have, even with simultaneous taps", async () => {
    const results = await Promise.all(Array.from({ length: MAX_OPEN_PER_MEMBER + 3 }, (_, i) => send(`Request ${i}`)));
    expect(results.filter((r) => r.ok)).toHaveLength(MAX_OPEN_PER_MEMBER);
    expect((await send("another", { userId: PRIYA })).ok).toBe(true); // other members unaffected
    // Once one is done, Sam can send again.
    const first = (await memberRequests(db, SAM))[0];
    await setRequestStatus(db, first.id, "done", JORDAN);
    expect((await send("one more")).ok).toBe(true);
  });
});

describe("staff handling a request", () => {
  it("Open -> In progress -> Done, recording who and when", async () => {
    const r = await send("Unlock the flat range shed", { activity: "flat", type: "help" });
    if (!r.ok) throw new Error(r.error);
    expect((await setRequestStatus(db, r.id, "in_progress", JORDAN)).ok).toBe(true);
    let [row] = await memberRequests(db, SAM);
    expect(row.status).toBe("in_progress");
    expect(row.started_by_name).toBe("Jordan");
    expect(row.started_at).toBeTruthy();
    expect(row.done_at).toBeNull();

    expect((await setRequestStatus(db, r.id, "done", JORDAN)).ok).toBe(true);
    [row] = await memberRequests(db, SAM);
    expect(row).toMatchObject({ status: "done", done_by_name: "Jordan", started_by_name: "Jordan" });
  });

  it("can go straight from Open to Done", async () => {
    const r = await send("Out of clays");
    if (!r.ok) throw new Error(r.error);
    expect((await setRequestStatus(db, r.id, "done", JORDAN)).ok).toBe(true);
    const [row] = await memberRequests(db, SAM);
    expect(row).toMatchObject({ status: "done", started_by_name: "Jordan", done_by_name: "Jordan" });
  });

  it("never goes backwards, and a second staff tap is refused instead of overwriting who handled it", async () => {
    const r = await send("Out of clays");
    if (!r.ok) throw new Error(r.error);
    await setRequestStatus(db, r.id, "done", JORDAN);
    const again = await setRequestStatus(db, r.id, "in_progress", JORDAN);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error).toMatch(/already done/);
    expect((await setRequestStatus(db, r.id, "done", PRIYA)).ok).toBe(false);
    expect((await setRequestStatus(db, r.id, "open", JORDAN)).ok).toBe(false);
    expect((await setRequestStatus(db, 999, "done", JORDAN)).ok).toBe(false);
    expect((await memberRequests(db, SAM))[0].done_by_name).toBe("Jordan");
  });

  it("the queue is newest first and filters by status and area", async () => {
    await send("first", { activity: "trap" });
    await send("second", { activity: "flat" });
    const third = await send("third", { activity: "trap" });
    if (!third.ok) throw new Error(third.error);
    await setRequestStatus(db, third.id, "in_progress", JORDAN);

    expect((await requestQueue(db)).map((r) => r.note)).toEqual(["third", "second", "first"]);
    expect((await requestQueue(db, { activity: "trap" })).map((r) => r.note)).toEqual(["third", "first"]);
    expect((await requestQueue(db, { status: "open" })).map((r) => r.note)).toEqual(["second", "first"]);
    expect((await requestQueue(db, { status: "in_progress", activity: "flat" }))).toHaveLength(0);
    const counts = await requestCounts(db);
    expect(counts.byStatus).toEqual({ open: 2, in_progress: 1, done: 0 });
    expect(counts.byArea).toEqual({ trap: 2, flat: 1 });
  });
});

describe("the permanent log", () => {
  it("requests can't be deleted, even directly in the database", async () => {
    await send("Out of clays");
    await expect(db.execute("DELETE FROM shop_requests")).rejects.toThrow(/permanent log/);
    expect(await requestQueue(db)).toHaveLength(1);
  });

  it("stays readable after the member deletes their account", async () => {
    await send("Out of clays");
    await db.execute("UPDATE users SET name = 'Deleted member', email = NULL, active = 0 WHERE id = 1");
    expect((await requestQueue(db))[0].member_name).toBe("Deleted member");
  });
});

describe("migration and settings", () => {
  it("upgrades a version-1 database without touching its data", async () => {
    const { createClient } = await import("@libsql/client");
    const { mkdtempSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), "rangeday-mig-"));
    const old = createClient({ url: `file:${join(dir, "v1.db")}` });
    try {
      await old.execute("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
      await old.batch([...MIGRATIONS[0], "INSERT INTO meta VALUES ('schema_version','1')"], "write");
      await old.execute("INSERT INTO users (id,name,member_no,role) VALUES (7,'Existing','9000','member')");
      expect(await migrate(old)).toBe(false); // not brand new
      expect(await schemaVersion(old)).toBe(MIGRATIONS.length);
      expect((await old.execute("SELECT name FROM users WHERE id = 7")).rows[0].name).toBe("Existing");
      await old.execute("INSERT INTO shop_requests (user_id, activity, type, note) VALUES (7, 'trap', 'other', 'works')");
    } finally {
      old.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("the shop phone is a club setting with a sensible check", async () => {
    expect(cfg.shopPhone).toBeTruthy();
    expect(isPhone("(555) 014-2290")).toBe(true);
    expect(isPhone("+1 555 014 2290")).toBe(true);
    expect(isPhone("call me")).toBe(false);
    expect(isPhone("123")).toBe(false);
    const base = { clubName: "Oak & Feather Ranch", tagline: "", primary: "#1b2a41", accent: "#4a7a4c" };
    expect((await saveBranding(db, { ...base, shopPhone: "nope" })).ok).toBe(false);
    expect((await saveBranding(db, { ...base, shopPhone: "(555) 010-9999" })).ok).toBe(true);
    expect((await getConfig(db)).shopPhone).toBe("(555) 010-9999");
  });
});
