import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getCtx } from "@/lib/context";
import { MODE_LABEL } from "@/lib/config";
import { memberBookings } from "@/lib/booking";
import { busyByArea, clubWide } from "@/lib/busy";
import { upcomingEvents } from "@/lib/events";
import { memberLessons } from "@/lib/lessons";
import { greeting, prettyDate, prettyTime } from "@/lib/time";
import AreaBusyList from "@/components/AreaBusyList";
import BusyMeter from "@/components/BusyMeter";
import EventCard from "@/components/EventCard";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const { db, cfg, now } = await getCtx();
  const [{ upcoming }, lessons, areas, events] = await Promise.all([
    memberBookings(db, user.id, now),
    memberLessons(db, user.id, now),
    busyByArea(db, cfg, now.date, now),
    upcomingEvents(db, user.id, now),
  ]);

  // The soonest of the member's bookings and lessons.
  const next = [
    ...upcoming.slice(0, 1).map((b) => ({ key: b.date + b.start_time, href: `/account/bookings/${b.id}`, title: b.station_name, date: b.date, time: b.start_time })),
    ...lessons.upcoming.slice(0, 1).map((l) => ({ key: l.date + l.start_time, href: `/account/lessons/${l.id}`, title: `Lesson with ${l.instructor_name}`, date: l.date, time: l.start_time })),
  ].sort((a, b) => a.key.localeCompare(b.key))[0];
  const more = upcoming.length + lessons.upcoming.length - (next ? 1 : 0);

  return (
    <>
      <div className="bar">
        <h1>{greeting(now)}, {user.name.split(" ")[0]}</h1>
        <p>{cfg.clubName}</p>
      </div>
      <div className="pad">
        {sp.welcome && <p className="note ok" role="status">Welcome to {cfg.clubName}! Your account is ready.</p>}
        <div className="lbl">Your next booking</div>
        {next ? (
          <Link href={next.href} className="card highlight">
            <h3>{next.title} · {prettyDate(next.date)} {prettyTime(next.time)}</h3>
            <p>{more > 0 ? `${more} more upcoming` : "Tap for details"}</p>
          </Link>
        ) : (
          <Link href="/book" className="card">
            <h3>Nothing booked yet</h3>
            <p>Grab a slot or a lesson in under a minute</p>
          </Link>
        )}

        <div className="lbl">How busy is it today</div>
        <BusyMeter hours={clubWide(areas)} now={now} title="Whole club" basis="Bookings + check-ins" />
        <AreaBusyList areas={areas} now={now} />

        <div className="lbl">Book something</div>
        {cfg.activities.filter((a) => a.active).map((a) => (
          <Link key={a.key} href={`/book?activity=${a.key}`} className="card">
            <h3>{a.label}</h3>
            <p>
              {a.mode === "walkaround"
                ? "Walk-around: no booking needed, see how busy it is"
                : a.mode === "shared"
                  ? `${MODE_LABEL.shared}: up to ${a.perSlot} people per time`
                  : "Book your own field"}
            </p>
          </Link>
        ))}
        <Link href="/book/lesson" className="card">
          <h3>Book a lesson</h3>
          <p>See which instructors are free and pick a time</p>
        </Link>

        <div className="lbl">What&apos;s on</div>
        {events.filter((e) => !e.cancelled).slice(0, 2).map((e) => <EventCard key={e.id} e={e} />)}
        <Link href="/events" className="link-btn" style={{ display: "inline-block", marginTop: 6 }}>All events ›</Link>
      </div>
    </>
  );
}
