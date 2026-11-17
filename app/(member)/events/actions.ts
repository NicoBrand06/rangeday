"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { getCtx } from "@/lib/context";
import { cancelRsvp, rsvp } from "@/lib/events";
import { notify } from "@/lib/notify";

export async function rsvpAction(formData: FormData) {
  const user = await requireUser();
  const { db, now } = await getCtx();
  const id = Number(formData.get("id"));
  const going = formData.get("going") === "1";
  let q: string;
  if (going) {
    const r = await rsvp(db, id, user.id, now);
    q = r.ok ? (r.status === "going" ? "joined=1" : "waitlisted=1") : `error=${encodeURIComponent(r.error)}`;
  } else {
    const r = await cancelRsvp(db, id, user.id, now);
    if (r.ok) for (const u of r.promoted) await notify({ kind: "waitlist_promoted", userId: u, eventId: id });
    q = r.ok ? "left=1" : `error=${encodeURIComponent(r.error)}`;
  }
  revalidatePath("/", "layout");
  redirect(`/events/${id}?${q}`);
}
