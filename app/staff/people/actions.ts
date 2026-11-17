"use server";
import { resetPassword } from "@/lib/accounts";
import { requireStaff } from "@/lib/auth";
import { back } from "@/lib/back";
import { getCtx } from "@/lib/context";
import { canManage, setActive, setRole } from "@/lib/staff";

export async function roleAction(formData: FormData) {
  const staff = await requireStaff();
  const role = formData.get("role") === "staff" ? "staff" : "member";
  const r = await setRole((await getCtx()).db, staff, Number(formData.get("id")), role);
  back("/staff/people", r.ok ? { msg: role === "staff" ? "Now has staff access." : "Staff access removed." } : { error: r.error });
}

export async function activeAction(formData: FormData) {
  const staff = await requireStaff();
  const active = formData.get("active") === "1";
  const r = await setActive((await getCtx()).db, staff, Number(formData.get("id")), active);
  back("/staff/people", r.ok ? { msg: active ? "Account reactivated." : "Account deactivated and signed out everywhere." } : { error: r.error });
}

export type ResetState = { temporary?: string; name?: string; error?: string } | undefined;

/** Stand-in for an email reset: shows a one-time temporary password to read out to the member. */
export async function resetPasswordAction(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const staff = await requireStaff();
  const { db } = await getCtx();
  const id = Number(formData.get("id"));
  const g = await canManage(db, staff, id);
  if (!g.ok) return { error: g.error };
  if (Number(g.target.is_demo)) return { error: "Demo accounts don't have passwords." };
  const r = await resetPassword(db, id);
  return r.ok ? { temporary: r.temporary, name: g.target.name } : { error: r.error };
}
