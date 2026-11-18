"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCtx } from "@/lib/context";
import { requireUser } from "@/lib/auth";
import { createRequest } from "@/lib/requests";

export async function sendRequestAction(formData: FormData) {
  const user = await requireUser();
  const { db, cfg } = await getCtx();
  const r = await createRequest(db, cfg, {
    userId: user.id,
    activity: String(formData.get("activity") ?? ""),
    type: String(formData.get("type") ?? ""),
    note: String(formData.get("note") ?? ""),
  });
  revalidatePath("/", "layout");
  redirect(`/requests?${r.ok ? "sent=1" : `error=${encodeURIComponent(r.error)}`}#mine`);
}
