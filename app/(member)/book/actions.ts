"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { cancelBooking, createBooking } from "@/lib/booking";
import { getCtx } from "@/lib/context";
import { bookLesson, cancelLesson } from "@/lib/lessons";
import { notify } from "@/lib/notify";
import { cancelVisit, planVisit } from "@/lib/visits";

const str = (f: FormData, k: string) => String(f.get(k) ?? "");

export async function bookSlot(formData: FormData) {
  const user = await requireUser();
  const { db, cfg, now } = await getCtx();
  const activity = str(formData, "activity");
  const date = str(formData, "date");
  const time = str(formData, "time");
  const result = await createBooking(
    db,
    cfg,
    { userId: user.id, stationId: Number(formData.get("station")), date, time, partySize: Number(formData.get("party")) },
    now,
  );
  if (!result.ok) redirect(`/book?${new URLSearchParams({ activity, date, time, error: result.error })}`);
  await notify({ kind: "booking", userId: user.id, bookingId: result.id });
  revalidatePath("/", "layout");
  redirect(`/account/bookings/${result.id}?new=1`);
}

export async function cancelMyBooking(formData: FormData) {
  const user = await requireUser();
  const { db, cfg, now } = await getCtx();
  const id = Number(formData.get("id"));
  const result = await cancelBooking(db, cfg, id, user, now);
  revalidatePath("/", "layout");
  redirect(`/account/bookings/${id}?${result.ok ? "cancelled=1" : `error=${encodeURIComponent(result.error)}`}`);
}

export async function planVisitAction(formData: FormData) {
  const user = await requireUser();
  const { db, cfg, now } = await getCtx();
  const activity = str(formData, "activity");
  const date = str(formData, "date");
  const r = await planVisit(db, cfg, { userId: user.id, activity, date, time: str(formData, "time"), partySize: Number(formData.get("party")) }, now);
  revalidatePath("/", "layout");
  redirect(`/book?${new URLSearchParams({ activity, date, ...(r.ok ? { planned: "1" } : { error: r.error }) })}`);
}

export async function cancelVisitAction(formData: FormData) {
  const user = await requireUser();
  const { db } = await getCtx();
  const r = await cancelVisit(db, Number(formData.get("id")), user.id);
  revalidatePath("/", "layout");
  const back = str(formData, "back") || "/account";
  redirect(`${back}${back.includes("?") ? "&" : "?"}${r.ok ? "visitCancelled=1" : `error=${encodeURIComponent(r.error)}`}`);
}

export async function bookLessonAction(formData: FormData) {
  const user = await requireUser();
  const { db, cfg, now } = await getCtx();
  const discipline = str(formData, "discipline");
  const date = str(formData, "date");
  const r = await bookLesson(
    db,
    cfg,
    { instructorId: Number(formData.get("instructor")), userId: user.id, discipline, date, time: str(formData, "time") },
    now,
  );
  if (!r.ok) redirect(`/book/lesson?${new URLSearchParams({ discipline, date, error: r.error })}`);
  await notify({ kind: "lesson", userId: user.id, lessonId: r.id });
  revalidatePath("/", "layout");
  redirect(`/account/lessons/${r.id}?new=1`);
}

export async function cancelLessonAction(formData: FormData) {
  const user = await requireUser();
  const { db, cfg, now } = await getCtx();
  const id = Number(formData.get("id"));
  const r = await cancelLesson(db, cfg, id, user, now);
  revalidatePath("/", "layout");
  redirect(`/account/lessons/${id}?${r.ok ? "cancelled=1" : `error=${encodeURIComponent(r.error)}`}`);
}
