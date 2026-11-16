import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getEvent, hasStarted, spotsLeft } from "@/lib/events";
import { clubNow, prettyDate, prettyTime } from "@/lib/time";
import { EventStatus } from "@/components/EventCard";
import { rsvpAction } from "../actions";

export default async function EventPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ joined?: string; left?: string; error?: string }> }) {
  const [{ id }, sp, user] = await Promise.all([params, searchParams, requireUser()]);
  const e = await getEvent(await getDb(), Number(id), user.id);
  if (!e) notFound();
  const started = hasStarted(e, clubNow());
  const left = spotsLeft(e);

  return (
    <>
      <div className="bar">
        <Link href="/events" className="back">‹ Events</Link>
        <h1>{e.title}</h1>
        <p>{e.category}</p>
      </div>
      <div className="pad">
        {sp.joined && <p className="note ok" role="status">You&apos;re on the list. See you there.</p>}
        {sp.left && <p className="note ok" role="status">RSVP cancelled. Your spot is open for someone else.</p>}
        {sp.error && <p className="note error" role="alert">{sp.error}</p>}

        <div className="card" style={{ marginTop: 12 }}>
          <div className="card-row" style={{ marginBottom: 10 }}>
            <h3 className="grow">Details</h3>
            <EventStatus e={e} />
          </div>
          <dl className="kv">
            <dt>When</dt><dd>{prettyDate(e.date)} · {prettyTime(e.start_time)} to {prettyTime(e.end_time)}</dd>
            <dt>Where</dt><dd>{e.location}</dd>
            <dt>Places</dt><dd>{e.going} going · {left > 0 ? `${left} of ${e.capacity} left` : "full"}</dd>
          </dl>
        </div>
        <p style={{ marginTop: 6 }}>{e.description}</p>

        {e.cancelled ? (
          <p className="note error">This event has been cancelled by the club.</p>
        ) : started ? (
          <p className="note">This event has started, so RSVPs are closed.</p>
        ) : e.mine ? (
          <form action={rsvpAction}>
            <input type="hidden" name="id" value={e.id} />
            <input type="hidden" name="going" value="0" />
            <button className="btn danger">Cancel my RSVP</button>
          </form>
        ) : left > 0 ? (
          <form action={rsvpAction}>
            <input type="hidden" name="id" value={e.id} />
            <input type="hidden" name="going" value="1" />
            <button className="btn">RSVP, I&apos;m going</button>
          </form>
        ) : (
          <p className="note">This event is full. A waitlist is on the roadmap; for now, check back in case someone cancels.</p>
        )}
      </div>
    </>
  );
}
