"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb, resetDemoData } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { cancelBooking, createBooking } from "@/lib/booking";
import { createEvent, setAttendance, setEventCancelled, updateEvent, type EventInput } from "@/lib/staff";
import { staffUpdateReservation, type ReservationStatus } from "@/lib/shop";
import { clubNow } from "@/lib/time";

function back(path: string, params: Record<string, string>) {
  revalidatePath("/", "layout");
  redirect(`${path}?${new URLSearchParams(params)}`);
}

// ---- Today's bookings ----

export async function attendanceAction(formData: FormData) {
  await requireStaff();
  const date = String(formData.get("date"));
  const to = String(formData.get("to")) as "checked_in" | "no_show" | "booked";
  const r = await setAttendance(await getDb(), Number(formData.get("id")), to, clubNow());
  back("/staff", r.ok ? { date } : { date, error: r.error });
}

export async function staffCancelAction(formData: FormData) {
  const staff = await requireStaff();
  const date = String(formData.get("date"));
  const r = await cancelBooking(await getDb(), Number(formData.get("id")), staff, clubNow());
  back("/staff", r.ok ? { date, msg: "Booking cancelled. The slot is open again." } : { date, error: r.error });
}

export async function phoneBookingAction(formData: FormData) {
  await requireStaff();
  const date = String(formData.get("date"));
  const r = await createBooking(
    await getDb(),
    {
      userId: Number(formData.get("member")),
      stationId: Number(formData.get("station")),
      date,
      time: String(formData.get("time")),
      partySize: Number(formData.get("party")),
      source: "phone",
    },
    clubNow(),
  );
  back("/staff", r.ok ? { date, msg: "Phone booking added. It's in the same list as app bookings." } : { date, error: r.error });
}

export async function resetDemoAction() {
  await requireStaff();
  await resetDemoData();
  back("/staff", { msg: "Demo data reset." });
}

// ---- Events ----

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
  const db = await getDb();
  const id = Number(formData.get("id")) || 0;
  const input = eventFrom(formData);
  if (id) {
    const r = await updateEvent(db, id, input, clubNow());
    back(`/staff/events/${id}`, r.ok ? { msg: "Saved." } : { error: r.error });
  } else {
    const r = await createEvent(db, input, clubNow());
    if (!r.ok) back("/staff/events/new", { error: r.error, ...Object.fromEntries(Object.entries(input).map(([k, v]) => [k, String(v)])) });
    else back(`/staff/events/${r.id}`, { msg: "Event published. Members can RSVP now." });
  }
}

export async function cancelEventAction(formData: FormData) {
  await requireStaff();
  const id = Number(formData.get("id"));
  const cancel = formData.get("cancel") === "1";
  await setEventCancelled(await getDb(), id, cancel);
  back(`/staff/events/${id}`, { msg: cancel ? "Event cancelled. Members who RSVP'd see it marked as cancelled." : "Event reinstated." });
}

// ---- Pro shop reservations ----

export async function reservationAction(formData: FormData) {
  await requireStaff();
  const to = String(formData.get("to")) as ReservationStatus;
  const note = String(formData.get("note") ?? "");
  const r = await staffUpdateReservation(await getDb(), Number(formData.get("id")), to, note);
  const words: Record<string, string> = { confirmed: "Confirmed. The member now sees “Ready for pickup”.", declined: "Declined. The member sees your note.", picked_up: "Marked as picked up." };
  back("/staff/reservations", r.ok ? { msg: words[to] ?? "Updated." } : { error: r.error });
}
