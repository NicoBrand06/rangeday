"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { changePassword, deleteAccount, updateName, verifyPassword } from "@/lib/accounts";
import { requireUser, signOut } from "@/lib/auth";
import { getCtx } from "@/lib/context";
import { promoteWaitlist } from "@/lib/events";

const back = (q: string) => redirect(`/account/profile?${q}`);

export async function updateNameAction(formData: FormData) {
  const user = await requireUser();
  const r = await updateName((await getCtx()).db, user.id, String(formData.get("name") ?? ""));
  revalidatePath("/", "layout");
  back(r.ok ? "saved=name" : `error=${encodeURIComponent(r.error)}`);
}

export async function changePasswordAction(formData: FormData) {
  const user = await requireUser();
  if (user.is_demo) back(`error=${encodeURIComponent("The demo account has no password. Create your own account to try this.")}`);
  const next = String(formData.get("next") ?? "");
  if (next !== String(formData.get("confirm") ?? "")) back(`error=${encodeURIComponent("The new passwords don't match.")}`);
  const r = await changePassword((await getCtx()).db, user.id, String(formData.get("current") ?? ""), next);
  back(r.ok ? "saved=password" : `error=${encodeURIComponent(r.error)}`);
}

export async function deleteAccountAction(formData: FormData) {
  const user = await requireUser();
  if (user.is_demo) back(`error=${encodeURIComponent("The shared demo account can't be deleted.")}`);
  const { db, now } = await getCtx();
  const row = (await db.execute({ sql: "SELECT password_hash FROM users WHERE id = ?", args: [user.id] })).rows[0];
  if (!(await verifyPassword(String(formData.get("password") ?? ""), (row?.password_hash as string) ?? null)))
    back(`error=${encodeURIComponent("Enter your current password to delete your account.")}`);
  const events = await deleteAccount(db, user.id, now.date);
  for (const id of events) await promoteWaitlist(db, id); // your places go to the next people in line
  await signOut();
  redirect("/login?deleted=1");
}
