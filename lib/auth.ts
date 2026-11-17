import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSession, endSession, parseStaffEmails, userForSession, type User } from "./accounts";
import { getDb } from "./db";

// Signed-in state is a random session token in an httpOnly cookie (JavaScript on the page
// can't read it). The database stores only a hash of the token. See lib/accounts.ts.

export type { User };
export const SESSION_COOKIE = "rd_session";

export function staffEmails() {
  return parseStaffEmails(process.env.STAFF_EMAILS);
}

export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return userForSession(await getDb(), token);
}

export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

/** Every staff page AND every staff action calls this. Members are sent back to the app. */
export async function requireStaff(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "staff") redirect("/");
  return user;
}

export async function startSession(userId: number) {
  const { token, expires } = await createSession(await getDb(), userId);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
}

export async function signOut() {
  const jar = await cookies();
  await endSession(await getDb(), jar.get(SESSION_COOKIE)?.value);
  jar.delete(SESSION_COOKIE);
}
