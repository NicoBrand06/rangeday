"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { cancelRsvp, rsvp } from "@/lib/events";
import { clubNow } from "@/lib/time";

export async function rsvpAction(formData: FormData) {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  const going = formData.get("going") === "1";
  const db = await getDb();
  const r = going ? await rsvp(db, id, user.id, clubNow()) : await cancelRsvp(db, id, user.id, clubNow());
  revalidatePath("/", "layout");
  redirect(`/events/${id}?${r.ok ? (going ? "joined=1" : "left=1") : `error=${encodeURIComponent(r.error)}`}`);
}
