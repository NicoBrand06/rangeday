import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Client } from "@libsql/client";
import { openTestDb } from "./setup";
import { changePassword, createSession, deleteAccount, logIn, parseStaffEmails, resetPassword, signUp, userForSession } from "../lib/accounts";
import { maskEmail, setActive, setRole } from "../lib/staff";

let db: Client;
let close: () => void;
const STAFF = parseStaffEmails(" Boss@Example.com , ");
const T0 = new Date("2026-11-16T15:00:00Z");

beforeEach(async () => {
  ({ db, close } = await openTestDb());
});
afterEach(() => close());

const join = (email = "sam@example.com", password = "correct horse") => signUp(db, { name: "Sam Whitaker", email, password }, STAFF);

describe("sign-up and login", () => {
  it("stores a hash, never the password, and logs in with either email case", async () => {
    const r = await join();
    expect(r.ok).toBe(true);
    const row = (await db.execute("SELECT password_hash, member_no, role FROM users")).rows[0];
    expect(String(row.password_hash)).toMatch(/^scrypt\$/);
    expect(String(row.password_hash)).not.toContain("correct horse");
    expect(row.member_no).toBe("1001");
    expect(row.role).toBe("member");
    expect((await logIn(db, "SAM@example.com", "correct horse", STAFF, T0)).ok).toBe(true);
  });

  it("refuses short passwords, bad emails and duplicate accounts", async () => {
    expect((await join("a@b.co", "short")).ok).toBe(false);
    expect((await join("not-an-email")).ok).toBe(false);
    await join();
    const dup = await join("Sam@Example.com");
    expect(dup.ok).toBe(false);
  });

  it("gives the same message for a wrong password and an unknown email", async () => {
    await join();
    const a = await logIn(db, "sam@example.com", "wrong password", STAFF, T0);
    const b = await logIn(db, "nobody@example.com", "whatever1", STAFF, T0);
    expect(!a.ok && !b.ok && a.error === b.error).toBe(true);
  });

  it("locks an email for 15 minutes after 5 wrong passwords", async () => {
    await join();
    for (let i = 0; i < 5; i++) await logIn(db, "sam@example.com", "nope nope", STAFF, T0);
    const locked = await logIn(db, "sam@example.com", "correct horse", STAFF, new Date(T0.getTime() + 60_000));
    expect(locked.ok).toBe(false);
    if (!locked.ok) expect(locked.error).toMatch(/Too many attempts/);
    expect((await logIn(db, "sam@example.com", "correct horse", STAFF, new Date(T0.getTime() + 16 * 60_000))).ok).toBe(true);
  });

  it("makes STAFF_EMAILS staff on sign-up", async () => {
    await signUp(db, { name: "The Boss", email: "boss@example.com", password: "long enough" }, STAFF);
    expect((await db.execute("SELECT role FROM users WHERE email = 'boss@example.com'")).rows[0].role).toBe("staff");
  });
});

describe("sessions", () => {
  it("finds the user from the token, and expires after 30 days", async () => {
    const r = await join();
    if (!r.ok) throw new Error(r.error);
    const { token } = await createSession(db, r.userId, T0);
    expect((await userForSession(db, token, T0))?.name).toBe("Sam Whitaker");
    expect(await userForSession(db, token, new Date(T0.getTime() + 31 * 86_400_000))).toBeNull();
    expect(await userForSession(db, "made-up-token", T0)).toBeNull();
    // Only a hash is stored.
    const stored = (await db.execute("SELECT token_hash FROM sessions")).rows[0].token_hash;
    expect(stored).not.toBe(token);
  });

  it("a staff password reset signs the member out everywhere and gives a working temporary password", async () => {
    const r = await join();
    if (!r.ok) throw new Error(r.error);
    const { token } = await createSession(db, r.userId, T0);
    const reset = await resetPassword(db, r.userId);
    if (!reset.ok) throw new Error(reset.error);
    expect(await userForSession(db, token, T0)).toBeNull();
    expect((await logIn(db, "sam@example.com", reset.temporary, STAFF, T0)).ok).toBe(true);
    expect((await changePassword(db, r.userId, reset.temporary, "brand new pw")).ok).toBe(true);
  });

  it("deleting an account removes name and email and signs out", async () => {
    const r = await join();
    if (!r.ok) throw new Error(r.error);
    const { token } = await createSession(db, r.userId, T0);
    await deleteAccount(db, r.userId, "2026-11-16");
    const row = (await db.execute({ sql: "SELECT name, email, active FROM users WHERE id = ?", args: [r.userId] })).rows[0];
    expect([row.name, row.email, Number(row.active)]).toEqual(["Deleted member", null, 0]);
    expect(await userForSession(db, token, T0)).toBeNull();
  });
});

describe("People page rules", () => {
  beforeEach(async () => {
    await db.execute(`INSERT INTO users (id,name,email,member_no,role,is_demo) VALUES
      (1,'Jordan (demo)',NULL,'S-01','staff',1),(2,'Real Staff','real@club.com','1001','staff',0),
      (3,'Real Member','m@club.com','1002','member',0),(4,'Demo Member',NULL,'1042','member',1)`);
  });

  it("the shared demo staff login can't change real accounts", async () => {
    const demo = { id: 1, is_demo: 1 };
    expect((await setRole(db, demo, 3, "staff")).ok).toBe(false);
    expect((await setActive(db, demo, 3, false)).ok).toBe(false);
    expect((await setRole(db, demo, 4, "staff")).ok).toBe(true);
  });

  it("nobody can change their own account, and the last staff can't be demoted", async () => {
    const real = { id: 2, is_demo: 0 };
    expect((await setRole(db, real, 2, "member")).ok).toBe(false);
    await setRole(db, real, 1, "member"); // demote the demo staff, leaving one staff
    const other = { id: 3, is_demo: 0 };
    const r = await setRole(db, other, 2, "member");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/last staff/);
  });

  it("deactivating signs the person out", async () => {
    const { token } = await createSession(db, 3, T0);
    expect((await setActive(db, { id: 2, is_demo: 0 }, 3, false)).ok).toBe(true);
    expect(await userForSession(db, token, T0)).toBeNull();
    expect((await logIn(db, "m@club.com", "anything1", [], T0)).ok).toBe(false);
  });

  it("masks emails for the demo", () => {
    expect(maskEmail("jordan.ellis@example.com")).toBe("jo•••@example.com");
  });
});
