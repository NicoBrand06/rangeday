// One place where member confirmations would be sent (booking made, RSVP, promoted off a
// waitlist, reservation confirmed...). For the beta, confirmations are shown in the app only;
// email and push are on the Later list. When they're added, only this file needs to change.

export type Notice =
  | { kind: "booking"; userId: number; bookingId: number }
  | { kind: "lesson"; userId: number; lessonId: number }
  | { kind: "waitlist_promoted"; userId: number; eventId: number }
  | { kind: "reservation"; userId: number; reservationId: number; status: string };

export async function notify(_notice: Notice): Promise<void> {
  // Intentionally does nothing yet.
}
