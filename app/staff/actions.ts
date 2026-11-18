"use server";
import { redirect } from "next/navigation";
import { back } from "@/lib/back";
import { demoMode, resetDemoData } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { cancelBooking, createBooking } from "@/lib/booking";
import { getCtx } from "@/lib/context";
import { notify } from "@/lib/notify";
import { setAttendance } from "@/lib/staff";
import { staffUpdateReservation, type ReservationStatus } from "@/lib/shop";
import { checkInVisit, recordWalkIn, undoCheckIn } from "@/lib/visits";
import { setRequestStatus } from "@/lib/requests";

// Every staff action starts with requireStaff(), so a member can't call these
// even by crafting the request by hand.

// ---- Today's bookings ----

export async function attendanceAction(formData: FormData) {
  await requireStaff();
  const { db, now } = await getCtx();
  const date = String(formData.get("date"));
  const to = String(formData.get("to")) as "checked_in" | "no_show" | "booked";
  const r = await setAttendance(db, Number(formData.get("id")), to, now);
  back("/staff", r.ok ? { date } : { date, error: r.error });
}

export async function staffCancelAction(formData: FormData) {
  const staff = await requireStaff();
  const { db, cfg, now } = await getCtx();
  const date = String(formData.get("date"));
  const r = await cancelBooking(db, cfg, Number(formData.get("id")), staff, now);
  back("/staff", r.ok ? { date, msg: "Booking cancelled. The time is open again." } : { date, error: r.error });
}

export async function phoneBookingAction(formData: FormData) {
  await requireStaff();
  const { db, cfg, now } = await getCtx();
  const date = String(formData.get("date"));
  const userId = Number(formData.get("member"));
  const r = await createBooking(
    db,
    cfg,
    { userId, stationId: Number(formData.get("station")), date, time: String(formData.get("time")), partySize: Number(formData.get("party")), source: "phone" },
    now,
  );
  if (r.ok) await notify({ kind: "booking", userId, bookingId: r.id });
  back("/staff", r.ok ? { date, msg: "Phone booking added. It's in the same list as app bookings." } : { date, error: r.error });
}

// ---- Walk-around course check-ins ----

export async function walkInAction(formData: FormData) {
  await requireStaff();
  const { db, cfg, now } = await getCtx();
  const party = Number(formData.get("party"));
  const r = await recordWalkIn(db, cfg, String(formData.get("activity")), party, now);
  back("/staff", r.ok ? { msg: `Checked in a walk-in group of ${party}.` } : { error: r.error });
}

export async function visitCheckInAction(formData: FormData) {
  await requireStaff();
  const { db, now } = await getCtx();
  const id = Number(formData.get("id"));
  const r = formData.get("undo") ? await undoCheckIn(db, id) : await checkInVisit(db, id, now);
  back("/staff", r.ok ? {} : { error: r.error });
}

// ---- Demo ----

export async function resetDemoAction() {
  await requireStaff();
  if (!demoMode()) back("/staff", { error: "Reset is only available on the demo." });
  await resetDemoData();
  // The reset removes every session, including this one.
  redirect("/login?reset=1");
}

// ---- Pro shop reservations ----

export async function reservationAction(formData: FormData) {
  await requireStaff();
  const { db, cfg } = await getCtx();
  const id = Number(formData.get("id"));
  const to = String(formData.get("to")) as ReservationStatus;
  const r = await staffUpdateReservation(db, cfg, id, to, String(formData.get("note") ?? ""));
  if (r.ok) {
    const row = (await db.execute({ sql: "SELECT user_id FROM reservations WHERE id = ?", args: [id] })).rows[0];
    if (row) await notify({ kind: "reservation", userId: Number(row.user_id), reservationId: id, status: to });
  }
  const words: Record<string, string> = { confirmed: "Confirmed. The member now sees “Ready for pickup”.", declined: "Declined. The member sees your note.", picked_up: "Marked as picked up." };
  back("/staff/reservations", r.ok ? { msg: words[to] ?? "Updated." } : { error: r.error });
}

// ---- Member requests ("Let the shop know") ----

export async function requestStatusAction(formData: FormData) {
  const staff = await requireStaff();
  const { db } = await getCtx();
  const to = String(formData.get("to"));
  const r = await setRequestStatus(db, Number(formData.get("id")), to, staff.id);
  // Only ever go back to the requests page, whatever the form says.
  const url = new URL(String(formData.get("back") || "/staff/requests"), "http://x");
  const path = url.pathname === "/staff/requests" ? url.pathname : "/staff/requests";
  const params = Object.fromEntries(url.searchParams);
  back(path, r.ok ? { ...params, msg: to === "done" ? "Marked done. The member sees it in the app." : "Marked in progress. The member sees it in the app." } : { ...params, error: r.error });
}
