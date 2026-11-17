"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCtx } from "@/lib/context";
import { requireUser } from "@/lib/auth";
import { cancelReservation, reserveItem } from "@/lib/shop";

export async function reserveAction(formData: FormData) {
  const user = await requireUser();
  const itemId = Number(formData.get("item"));
  const r = await reserveItem((await getCtx()).db, user.id, itemId, Number(formData.get("qty")));
  revalidatePath("/", "layout");
  redirect(`/shop/${itemId}?${r.ok ? "reserved=1" : `error=${encodeURIComponent(r.error)}`}`);
}

export async function cancelReservationAction(formData: FormData) {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  const back = String(formData.get("back") || "/account");
  const r = await cancelReservation((await getCtx()).db, id, user.id);
  revalidatePath("/", "layout");
  const sep = back.includes("?") ? "&" : "?";
  redirect(`${back}${sep}${r.ok ? "withdrawn=1" : `error=${encodeURIComponent(r.error)}`}`);
}
