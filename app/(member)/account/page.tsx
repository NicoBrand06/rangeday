import Link from "next/link";
import { logout } from "../../actions";
import { requireUser } from "@/lib/auth";
import { getCtx } from "@/lib/context";
import { activityLabel } from "@/lib/config";
import { memberBookings } from "@/lib/booking";
import { upcomingEvents } from "@/lib/events";
import { memberLessons } from "@/lib/lessons";
import { expiresAt, reservationsFor } from "@/lib/shop";
import { memberVisits } from "@/lib/visits";
import { prettyDate, prettyInstant, prettyTime } from "@/lib/time";
import EventCard from "@/components/EventCard";
import ReservationCard from "@/components/ReservationCard";
import SubmitButton from "@/components/SubmitButton";
import { cancelVisitAction } from "../book/actions";

const PAST_LABEL: Record<string, [string, string]> = {
  checked_in: ["Attended", "green"],
  no_show: ["No-show", "red"],
  cancelled: ["Cancelled", ""],
  booked: ["Past", ""],
  done: ["Done", "green"],
};

type Search = { withdrawn?: string; error?: string; visitCancelled?: string };

export default async function AccountPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const { db, cfg, now } = await getCtx();
  const [{ upcoming, past }, lessons, visits, reservations, events] = await Promise.all([
    memberBookings(db, user.id, now),
    memberLessons(db, user.id, now),
    memberVisits(db, user.id, now),
    reservationsFor(db, cfg, user.id),
    upcomingEvents(db, user.id, now),
  ]);
  const myEvents = events.filter((e) => e.mine);
  const history = [
    ...past.map((b) => ({ key: `b${b.id}`, href: `/account/bookings/${b.id}`, title: b.station_name, date: b.date, time: b.start_time, status: b.status })),
    ...lessons.past.map((l) => ({ key: `l${l.id}`, href: `/account/lessons/${l.id}`, title: `Lesson · ${l.instructor_name}`, date: l.date, time: l.start_time, status: l.status })),
  ].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));

  return (
    <>
      <div className="bar">
        <h1>{user.name}</h1>
        <p>Member #{user.member_no}{user.role === "staff" ? " · Staff" : ""}</p>
      </div>
      <div className="pad">
        {sp.error && <p className="note error" role="alert">{sp.error}</p>}
        <div className="lbl">My upcoming bookings</div>
        {upcoming.length === 0 && lessons.upcoming.length === 0 && (
          <p className="card muted">Nothing booked yet. <Link href="/book" style={{ textDecoration: "underline" }}>Book a session or lesson</Link></p>
        )}
        {upcoming.map((b) => (
          <Link key={b.id} href={`/account/bookings/${b.id}`} className="card highlight">
            <h3>{b.station_name} · {prettyDate(b.date)} {prettyTime(b.start_time)}</h3>
            <p>{b.party_size === 1 ? "Just you" : `${b.party_size} people`}{Number(b.shared) ? " · shared area" : ""} · tap to view or cancel</p>
          </Link>
        ))}
        {lessons.upcoming.map((l) => (
          <Link key={`l${l.id}`} href={`/account/lessons/${l.id}`} className="card highlight">
            <h3>{activityLabel(cfg, l.discipline)} lesson · {prettyDate(l.date)} {prettyTime(l.start_time)}</h3>
            <p>With {l.instructor_name} · tap to view or cancel</p>
          </Link>
        ))}

        {(visits.length > 0 || sp.visitCancelled) && <div className="lbl">Planned visits</div>}
        {sp.visitCancelled && <p className="note ok" role="status">Planned visit removed.</p>}
        {visits.map((v) => (
          <div key={v.id} className="card card-row">
            <div className="grow">
              <h3>{activityLabel(cfg, v.activity)} · {prettyDate(v.date)} ~{prettyTime(v.time)}</h3>
              <p>{v.party_size === 1 ? "Just you" : `${v.party_size} people`} · walk-around, check in at the desk</p>
            </div>
            <form action={cancelVisitAction}>
              <input type="hidden" name="id" value={v.id} />
              <input type="hidden" name="back" value="/account" />
              <SubmitButton className="btn small sec" pending="…">Remove</SubmitButton>
            </form>
          </div>
        ))}

        <div className="lbl">My events</div>
        {myEvents.length === 0 && <p className="muted">No RSVPs yet. <Link href="/events" style={{ textDecoration: "underline" }}>See what&apos;s on</Link></p>}
        {myEvents.map((e) => <EventCard key={e.id} e={e} />)}

        <div className="lbl" id="reservations">Pro shop reservations</div>
        {sp.withdrawn && <p className="note ok" role="status">Reservation cancelled.</p>}
        {reservations.length === 0 && <p className="muted">Nothing reserved. <Link href="/shop" style={{ textDecoration: "underline" }}>Browse the pro shop</Link></p>}
        {reservations.slice(0, 6).map((r) => {
          const exp = expiresAt(r, cfg);
          return <ReservationCard key={r.id} r={r} back="/account" expires={exp ? prettyInstant(exp, cfg.timezone) : null} />;
        })}

        <div className="lbl">Past and cancelled</div>
        {history.length === 0 && <p className="muted">No history yet.</p>}
        {history.slice(0, 8).map((h) => (
          <Link key={h.key} href={h.href} className="item">
            <div style={{ flex: 1 }}>
              <h4>{h.title}</h4>
              <p>{prettyDate(h.date)} · {prettyTime(h.time)}</p>
            </div>
            <span className={`pill ${PAST_LABEL[h.status]?.[1] ?? ""}`}>{PAST_LABEL[h.status]?.[0] ?? h.status}</span>
          </Link>
        ))}

        <div className="lbl">Account</div>
        <Link href="/account/profile" className="card">
          <h3>Profile and password</h3>
          <p>{user.email ?? "Demo account"} · change your name or password, or delete your account</p>
        </Link>
        <form action={logout} style={{ marginTop: 8 }}>
          <SubmitButton className="btn sec" pending="Signing out…">{user.is_demo ? "Leave demo account" : "Log out"}</SubmitButton>
        </form>
      </div>
    </>
  );
}
