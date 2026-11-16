"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { cancelBooking, createBooking } from "@/lib/booking";
import { clubNow } from "@/lib/time";

export async function bookSlot(formData: FormData) {
  const user = await requireUser();
  const activity = String(formData.get("activity"));
  const date = String(formData.get("date"));
  const time = String(formData.get("time"));
  const db = await getDb();
  const result = await createBooking(
    db,
    { userId: user.id, stationId: Number(formData.get("station")), date, time, partySize: Number(formData.get("party")) },
    clubNow(),
  );
  if (!result.ok) {
    const q = new URLSearchParams({ activity, date, time, error: result.error });
    redirect(`/book?${q}`);
  }
  revalidatePath("/", "layout");
  redirect(`/account/bookings/${result.id}?new=1`);
}

export async function cancelMyBooking(formData: FormData) {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  const result = await cancelBooking(await getDb(), id, user, clubNow());
  revalidatePath("/", "layout");
  const q = result.ok ? "cancelled=1" : `error=${encodeURIComponent(result.error)}`;
  redirect(`/account/bookings/${id}?${q}`);
}
