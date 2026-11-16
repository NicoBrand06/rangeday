import Link from "next/link";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ACTIVITIES, CLUB_NAME } from "@/lib/club";
import { availability, memberBookings } from "@/lib/booking";
import { upcomingEvents } from "@/lib/events";
import { clubNow, greeting, prettyDate, prettyTime } from "@/lib/time";
import EventCard from "@/components/EventCard";
import BusyMeter from "@/components/BusyMeter";
import { busyByHour } from "@/lib/busy";

export default async function HomePage() {
  const user = await requireUser();
  const now = clubNow();
  const db = await getDb();
  const { upcoming } = await memberBookings(db, user.id, now);
  const next = upcoming[0];
  const hours = await busyByHour(db, now.date);
  const events = (await upcomingEvents(db, user.id, now)).filter((e) => !e.cancelled).slice(0, 2);

  // Open slots left today for each activity, for the "Book something" cards.
  const openToday = await Promise.all(
    ACTIVITIES.map(async (a) => {
      const slots = await availability(db, a.key, now.date, user.id, now);
      return slots.filter((s) => s.status === "open" || s.status === "few").length;
    }),
  );

  return (
    <>
      <div className="bar">
        <h1>{greeting(now)}, {user.name.split(" ")[0]}</h1>
        <p>{CLUB_NAME}</p>
      </div>
      <div className="pad">
        <div className="lbl">Your next booking</div>
        {next ? (
          <Link href={`/account/bookings/${next.id}`} className="card highlight">
            <h3>{next.station_name} · {prettyDate(next.date)} {prettyTime(next.start_time)}</h3>
            <p>{next.party_size === 1 ? "Just you" : `${next.party_size} shooters`}{upcoming.length > 1 ? ` · ${upcoming.length - 1} more upcoming` : ""}</p>
          </Link>
        ) : (
          <Link href="/book" className="card">
            <h3>Nothing booked yet</h3>
            <p>Grab a slot in under a minute</p>
          </Link>
        )}

        <div className="lbl">How busy is it today</div>
        <BusyMeter hours={hours} now={now} />

        <div className="lbl">Book something</div>
        {ACTIVITIES.map((a, i) => (
          <Link key={a.key} href={`/book?activity=${a.key}`} className="card">
            <h3>{a.label}</h3>
            <p>{openToday[i] > 0 ? `${openToday[i]} open times left today` : "Fully booked or closed for today; see other days"}</p>
          </Link>
        ))}

        <div className="lbl">What&apos;s on</div>
        {events.map((e) => <EventCard key={e.id} e={e} />)}
        <Link href="/events" className="link-btn" style={{ display: "inline-block", marginTop: 6 }}>All events ›</Link>
      </div>
    </>
  );
}
