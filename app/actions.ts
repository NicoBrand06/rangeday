"use server";
import { redirect } from "next/navigation";
import { logIn, signUp } from "@/lib/accounts";
import { signOut, staffEmails, startSession } from "@/lib/auth";
import { demoMode, getDb } from "@/lib/db";
import { DEMO_MEMBER_NO, DEMO_STAFF_NO } from "@/lib/seed";

export type FormState = { error?: string; email?: string; name?: string } | undefined;

async function landing(userId: number) {
  const row = (await (await getDb()).execute({ sql: "SELECT role FROM users WHERE id = ?", args: [userId] })).rows[0];
  return row?.role === "staff" ? "/staff" : "/";
}

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "");
  const r = await logIn(await getDb(), email, String(formData.get("password") ?? ""), staffEmails());
  if (!r.ok) return { error: r.error, email };
  await startSession(r.userId);
  redirect(await landing(r.userId));
}

export async function signupAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const name = String(formData.get("name") ?? "");
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  if (password !== String(formData.get("confirm") ?? "")) return { error: "The two passwords don't match.", name, email };
  const r = await signUp(await getDb(), { name, email, password }, staffEmails());
  if (!r.ok) return { error: r.error, name, email };
  await startSession(r.userId);
  redirect(`${await landing(r.userId)}?welcome=1`);
}

/** Demo mode only: one tap to try the app as the demo member or demo staff. */
export async function demoLogin(formData: FormData) {
  if (!demoMode()) redirect("/login");
  const memberNo = formData.get("role") === "staff" ? DEMO_STAFF_NO : DEMO_MEMBER_NO;
  const row = (await (await getDb()).execute({ sql: "SELECT id FROM users WHERE member_no = ? AND is_demo = 1", args: [memberNo] })).rows[0];
  if (!row) redirect("/login?error=demo");
  await startSession(Number(row.id));
  redirect(await landing(Number(row.id)));
}

export async function logout() {
  await signOut();
  redirect("/login");
}
