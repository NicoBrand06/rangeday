import type { Client } from "@libsql/client";
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { Result } from "./booking";

// Sign-up, login and sessions. Uses only Node's built-in crypto (no extra packages).
// - Passwords are hashed with scrypt and a random salt; the password itself is never stored.
// - Sessions are random tokens. The browser keeps the token; the database keeps only its hash.
// - 5 wrong passwords lock that email for 15 minutes.

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, keylen: number) => Promise<Buffer>;

export type User = { id: number; name: string; email: string | null; member_no: string; role: "member" | "staff"; is_demo: number };

export const MIN_PASSWORD = 8;
export const SESSION_DAYS = 30;
export const MAX_FAILURES = 5;
export const LOCK_MINUTES = 15;

const sqlTime = (d: Date) => d.toISOString().replace("T", " ").slice(0, 19); // SQLite datetime format (UTC)

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const [kind, salt, hash] = stored.split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await scrypt(password, Buffer.from(salt, "base64"), expected.length);
  return timingSafeEqual(actual, expected);
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

/** Emails listed in the STAFF_EMAILS setting become staff when they sign up or log in. */
export function parseStaffEmails(raw: string | undefined): string[] {
  return (raw ?? "").split(",").map(normalizeEmail).filter(Boolean);
}

function validEmail(e: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 200;
}

export function passwordProblem(pw: string): string | null {
  if (pw.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters for your password.`;
  if (pw.length > 200) return "That password is too long.";
  return null;
}

async function nextMemberNo(db: Client): Promise<string> {
  const rs = await db.execute("SELECT max(CAST(member_no AS INTEGER)) AS n FROM users WHERE member_no GLOB '[0-9]*'");
  return String(Math.max(1000, Number(rs.rows[0].n ?? 0)) + 1);
}

export async function signUp(
  db: Client,
  input: { name: string; email: string; password: string },
  staffEmails: string[] = [],
): Promise<Result<{ userId: number }>> {
  const name = input.name.trim().replace(/\s+/g, " ");
  const email = normalizeEmail(input.email);
  if (name.length < 2 || name.length > 80) return { ok: false, error: "Please enter your name." };
  if (!validEmail(email)) return { ok: false, error: "Please enter a valid email address." };
  const pwErr = passwordProblem(input.password);
  if (pwErr) return { ok: false, error: pwErr };
  const exists = await db.execute({ sql: "SELECT 1 FROM users WHERE email = ?", args: [email] });
  if (exists.rows.length) return { ok: false, error: "An account with that email already exists. Try logging in." };

  const role = staffEmails.includes(email) ? "staff" : "member";
  const hash = await hashPassword(input.password);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const rs = await db.execute({
        sql: "INSERT INTO users (name, email, password_hash, member_no, role) VALUES (?,?,?,?,?)",
        args: [name, email, hash, await nextMemberNo(db), role],
      });
      return { ok: true, userId: Number(rs.lastInsertRowid) };
    } catch (e) {
      if (String(e).includes("users.email")) return { ok: false, error: "An account with that email already exists. Try logging in." };
      if (!String(e).includes("UNIQUE")) throw e; // member number taken by a simultaneous sign-up: try the next one
    }
  }
  return { ok: false, error: "Something went wrong creating your account. Please try again." };
}

export async function logIn(
  db: Client,
  emailRaw: string,
  password: string,
  staffEmails: string[] = [],
  now = new Date(),
): Promise<Result<{ userId: number }>> {
  const email = normalizeEmail(emailRaw);
  const generic = { ok: false as const, error: "That email and password don't match. Check them and try again." };
  const lock = (await db.execute({ sql: "SELECT failures, locked_until FROM login_attempts WHERE email = ?", args: [email] })).rows[0];
  if (lock?.locked_until && String(lock.locked_until) > sqlTime(now)) {
    return { ok: false, error: `Too many attempts. For your security, try again in ${LOCK_MINUTES} minutes or ask the front desk to reset your password.` };
  }

  const user = (await db.execute({ sql: "SELECT id, password_hash, role, active FROM users WHERE email = ?", args: [email] })).rows[0];
  const ok = user && Number(user.active) === 1 && (await verifyPassword(password, user.password_hash as string | null));
  if (!ok) {
    const failures = (lock && !(lock.locked_until && String(lock.locked_until) <= sqlTime(now)) ? Number(lock.failures) : 0) + 1;
    const lockedUntil = failures >= MAX_FAILURES ? sqlTime(new Date(now.getTime() + LOCK_MINUTES * 60_000)) : null;
    await db.execute({
      sql: "INSERT OR REPLACE INTO login_attempts (email, failures, locked_until) VALUES (?,?,?)",
      args: [email, failures >= MAX_FAILURES ? 0 : failures, lockedUntil],
    });
    return generic;
  }
  await db.execute({ sql: "DELETE FROM login_attempts WHERE email = ?", args: [email] });
  if (staffEmails.includes(email) && user.role !== "staff") {
    await db.execute({ sql: "UPDATE users SET role = 'staff' WHERE id = ?", args: [user.id] });
  }
  return { ok: true, userId: Number(user.id) };
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(db: Client, userId: number, now = new Date()): Promise<{ token: string; expires: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(now.getTime() + SESSION_DAYS * 86_400_000);
  await db.execute({
    sql: "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)",
    args: [hashToken(token), userId, sqlTime(expires)],
  });
  return { token, expires };
}

export async function userForSession(db: Client, token: string | undefined, now = new Date()): Promise<User | null> {
  if (!token) return null;
  const rs = await db.execute({
    sql: `SELECT u.id, u.name, u.email, u.member_no, u.role, u.is_demo FROM sessions s JOIN users u ON u.id = s.user_id
          WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1`,
    args: [hashToken(token), sqlTime(now)],
  });
  return (rs.rows[0] as unknown as User) ?? null;
}

export async function endSession(db: Client, token: string | undefined) {
  if (token) await db.execute({ sql: "DELETE FROM sessions WHERE token_hash = ?", args: [hashToken(token)] });
}

export async function updateName(db: Client, userId: number, raw: string): Promise<Result> {
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 80) return { ok: false, error: "Please enter your name." };
  await db.execute({ sql: "UPDATE users SET name = ? WHERE id = ?", args: [name, userId] });
  return { ok: true };
}

export async function changePassword(db: Client, userId: number, current: string, next: string): Promise<Result> {
  const row = (await db.execute({ sql: "SELECT password_hash FROM users WHERE id = ?", args: [userId] })).rows[0];
  if (!row || !(await verifyPassword(current, row.password_hash as string | null))) return { ok: false, error: "Your current password isn't right." };
  const err = passwordProblem(next);
  if (err) return { ok: false, error: err };
  await db.execute({ sql: "UPDATE users SET password_hash = ? WHERE id = ?", args: [await hashPassword(next), userId] });
  return { ok: true };
}

/** Staff stand-in for an email reset: makes a one-time temporary password and logs the member out everywhere. */
export async function resetPassword(db: Client, userId: number): Promise<Result<{ temporary: string }>> {
  const temporary = randomBytes(6).toString("base64url"); // about 8 characters
  const rs = await db.execute({ sql: "UPDATE users SET password_hash = ? WHERE id = ? AND is_demo = 0", args: [await hashPassword(temporary), userId] });
  if (!rs.rowsAffected) return { ok: false, error: "Account not found." };
  await db.batch(
    [
      { sql: "DELETE FROM sessions WHERE user_id = ?", args: [userId] },
      { sql: "DELETE FROM login_attempts WHERE email = (SELECT email FROM users WHERE id = ?)", args: [userId] },
    ],
    "write",
  );
  return { ok: true, temporary };
}

/**
 * Delete an account. Bookings and history stay (for the club's records) but are no
 * longer linked to a name or email. Future bookings, RSVPs and open pickups are cancelled.
 */
export async function deleteAccount(db: Client, userId: number, today: string): Promise<number[]> {
  const rsvps = await db.execute({ sql: "SELECT event_id FROM rsvps WHERE user_id = ?", args: [userId] });
  await db.batch(
    [
      { sql: "UPDATE bookings SET status = 'cancelled' WHERE user_id = ? AND status = 'booked' AND date >= ?", args: [userId, today] },
      { sql: "DELETE FROM rsvps WHERE user_id = ?", args: [userId] },
      { sql: "UPDATE lessons SET status = 'cancelled' WHERE user_id = ? AND status = 'booked' AND date >= ?", args: [userId, today] },
      { sql: "UPDATE visits SET kind = 'cancelled' WHERE user_id = ? AND kind = 'expected'", args: [userId] },
      { sql: "UPDATE reservations SET status = 'cancelled', updated_at = datetime('now') WHERE user_id = ? AND status IN ('pending','confirmed')", args: [userId] },
      { sql: "DELETE FROM sessions WHERE user_id = ?", args: [userId] },
      {
        sql: "UPDATE users SET name = 'Deleted member', email = NULL, password_hash = NULL, active = 0 WHERE id = ?",
        args: [userId],
      },
    ],
    "write",
  );
  return rsvps.rows.map((r) => Number(r.event_id)); // events whose waitlists may need promoting
}
