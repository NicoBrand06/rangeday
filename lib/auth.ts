import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "./db";

// DEMO LOGIN ONLY. There are no passwords: the cookie just says which demo
// user you picked. Real sign-in is on the "Later" list.

export type User = { id: number; name: string; member_no: string; role: "member" | "staff" };

const COOKIE = "rd_user";

export async function currentUser(): Promise<User | null> {
  const id = Number((await cookies()).get(COOKIE)?.value);
  if (!id) return null;
  const db = await getDb();
  const row = (await db.execute({ sql: "SELECT id,name,member_no,role FROM users WHERE id = ?", args: [id] })).rows[0];
  return row ? (row as unknown as User) : null;
}

export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireStaff(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "staff") redirect("/");
  return user;
}

export async function signInAs(userId: number) {
  (await cookies()).set(COOKIE, String(userId), { httpOnly: true, sameSite: "lax", path: "/" });
}

export async function signOut() {
  (await cookies()).delete(COOKIE);
}
