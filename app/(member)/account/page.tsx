import Link from "next/link";
import { logout } from "../../actions";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { memberBookings } from "@/lib/booking";
import { upcomingEvents } from "@/lib/events";
import EventCard from "@/components/EventCard";
import ReservationCard from "@/components/ReservationCard";
import { reservationsFor } from "@/lib/shop";
import { clubNow, prettyDate, prettyTime } from "@/lib/time";

const PAST_LABEL: Record<string, [string, string]> = {
  checked_in: ["Attended", "green"],
  no_show: ["No-show", "red"],
  cancelled: ["Cancelled", ""],
  booked: ["Past", ""],
};

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ withdrawn?: string; error?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const now = clubNow();
  const { upcoming, past } = await memberBookings(db, user.id, now);
  const reservations = (await reservationsFor(db, user.id)).slice(0, 6);
  const myEvents = (await upcomingEvents(db, user.id, now)).filter((e) => e.mine);

  return (
    <>
      <div className="bar">
        <h1>{user.name}</h1>
        <p>Member #{user.member_no}</p>
      </div>
      <div className="pad">
        <div className="lbl">My upcoming bookings</div>
        {upcoming.length === 0 && (
          <p className="card muted">Nothing booked yet. <Link href="/book" style={{ textDecoration: "underline" }}>Book a session</Link></p>
        )}
        {upcoming.map((b) => (
          <Link key={b.id} href={`/account/bookings/${b.id}`} className="card highlight">
            <h3>{b.station_name} · {prettyDate(b.date)} {prettyTime(b.start_time)}</h3>
            <p>{b.party_size === 1 ? "Just you" : `${b.party_size} shooters`} · tap to view or cancel</p>
          </Link>
        ))}

        <div className="lbl">My events</div>
        {myEvents.length === 0 && <p className="muted">No RSVPs yet. <Link href="/events" style={{ textDecoration: "underline" }}>See what&apos;s on</Link></p>}
        {myEvents.map((e) => <EventCard key={e.id} e={e} />)}

        <div className="lbl" id="reservations">Pro shop reservations</div>
        {sp.withdrawn && <p className="note ok" role="status">Reservation cancelled.</p>}
        {sp.error && <p className="note error" role="alert">{sp.error}</p>}
        {reservations.length === 0 && <p className="muted">Nothing reserved. <Link href="/shop" style={{ textDecoration: "underline" }}>Browse the pro shop</Link></p>}
        {reservations.map((r) => <ReservationCard key={r.id} r={r} back="/account" />)}

        <div className="lbl">Past and cancelled bookings</div>
        {past.length === 0 && <p className="muted">No history yet.</p>}
        {past.slice(0, 6).map((b) => (
          <Link key={b.id} href={`/account/bookings/${b.id}`} className="item">
            <div style={{ flex: 1 }}>
              <h4>{b.station_name}</h4>
              <p>{prettyDate(b.date)} · {prettyTime(b.start_time)}</p>
            </div>
            <span className={`pill ${PAST_LABEL[b.status][1]}`}>{PAST_LABEL[b.status][0]}</span>
          </Link>
        ))}

        <form action={logout} style={{ marginTop: 20 }}>
          <button className="btn sec">Switch demo account</button>
        </form>
      </div>
    </>
  );
}
