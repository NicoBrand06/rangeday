"use server";
import { requireStaff } from "@/lib/auth";
import { back } from "@/lib/back";
import { getCtx } from "@/lib/context";
import { createEvent, REPEAT_OPTIONS, setEventCancelled, updateEvent, type EventInput, type Repeat } from "@/lib/events";
import { notify } from "@/lib/notify";

function eventFrom(formData: FormData): EventInput {
  const s = (k: string) => String(formData.get(k) ?? "");
  return {
    title: s("title"),
    category: s("category"),
    description: s("description"),
    date: s("date"),
    start_time: s("start_time"),
    end_time: s("end_time"),
    location: s("location"),
    capacity: Number(formData.get("capacity")),
  };
}

export async function saveEventAction(formData: FormData) {
  await requireStaff();
  const { db, now } = await getCtx();
  const id = Number(formData.get("id")) || 0;
  const input = eventFrom(formData);
  if (id) {
    const scope = formData.get("scope") === "future" ? "future" : "one";
    const r = await updateEvent(db, id, input, scope, now);
    if (r.ok) for (const u of r.promoted) await notify({ kind: "waitlist_promoted", userId: u, eventId: id });
    back(`/staff/events/${id}`, r.ok ? { msg: r.promoted.length ? `Saved. ${r.promoted.length} moved up from the waitlist.` : "Saved." } : { error: r.error });
  }
  const repeat = (REPEAT_OPTIONS as readonly string[]).includes(String(formData.get("repeat"))) ? (String(formData.get("repeat")) as Repeat) : "none";
  const r = await createEvent(db, input, repeat, now);
  if (!r.ok) back("/staff/events/new", { error: r.error, repeat, ...Object.fromEntries(Object.entries(input).map(([k, v]) => [k, String(v)])) });
  back(`/staff/events/${r.id}`, { msg: repeat === "none" ? "Event published. Members can sign up now." : "Repeating event published. Dates are listed about 12 weeks ahead." });
}

export async function cancelEventAction(formData: FormData) {
  await requireStaff();
  const { db } = await getCtx();
  const id = Number(formData.get("id"));
  const cancel = formData.get("cancel") === "1";
  const scope = formData.get("scope") === "future" ? "future" : "one";
  const r = await setEventCancelled(db, id, cancel, scope);
  const msg = !cancel ? "Event reinstated." : scope === "future" ? "This and all later dates are cancelled, and no new dates will be added." : "This date is cancelled. Members who signed up see it marked as cancelled.";
  back(`/staff/events/${id}`, r.ok ? { msg } : { error: r.error });
}
