import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getCtx } from "@/lib/context";
import { describeRule, getEvent, getSeries, hasStarted, spotsLeft } from "@/lib/events";
import { prettyDate, prettyTime } from "@/lib/time";
import { EventStatus } from "@/components/EventCard";
import SubmitButton from "@/components/SubmitButton";
import { rsvpAction } from "../actions";

type Search = { joined?: string; waitlisted?: string; left?: string; error?: string };

export default async function EventPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Search> }) {
  const [{ id }, sp, user] = await Promise.all([params, searchParams, requireUser()]);
  const { db, now } = await getCtx();
  const e = await getEvent(db, Number(id), user.id);
  if (!e) notFound();
  const series = await getSeries(db, e.series_id);
  const started = hasStarted(e, now);
  const left = spotsLeft(e);

  return (
    <>
      <div className="bar">
        <Link href="/events" className="back">‹ Events</Link>
        <h1>{e.title}</h1>
        <p>{e.category}{series ? ` · ${describeRule(series)}` : ""}</p>
      </div>
      <div className="pad">
        {sp.joined && <p className="note ok" role="status">You&apos;re on the list. See you there.</p>}
        {sp.waitlisted && <p className="note ok" role="status">It&apos;s full, so you&apos;re on the waitlist (#{e.my_position}). If a place opens up you&apos;ll get it automatically.</p>}
        {sp.left && <p className="note ok" role="status">Done. Your place is open for someone else.</p>}
        {sp.error && <p className="note error" role="alert">{sp.error}</p>}

        <div className="card" style={{ marginTop: 12 }}>
          <div className="card-row" style={{ marginBottom: 10 }}>
            <h3 className="grow">Details</h3>
            <EventStatus e={e} />
          </div>
          <dl className="kv">
            <dt>When</dt><dd>{prettyDate(e.date)} · {prettyTime(e.start_time)} to {prettyTime(e.end_time)}</dd>
            <dt>Where</dt><dd>{e.location}</dd>
            <dt>Places</dt><dd>{e.going} going · {left > 0 ? `${left} of ${e.capacity} left` : `full${e.waiting ? `, ${e.waiting} on the waitlist` : ""}`}</dd>
          </dl>
        </div>
        <p style={{ marginTop: 6 }}>{e.description}</p>

        {e.cancelled ? (
          <p className="note error">This event has been cancelled by the club.</p>
        ) : started ? (
          <p className="note">This event has started, so sign-ups are closed.</p>
        ) : e.mine ? (
          <form action={rsvpAction}>
            <input type="hidden" name="id" value={e.id} />
            <input type="hidden" name="going" value="0" />
            {e.mine === "waitlist" && <p className="note">You&apos;re <strong>#{e.my_position}</strong> on the waitlist. If someone cancels, you&apos;re moved in automatically.</p>}
            <SubmitButton className="btn danger" pending="Updating…">{e.mine === "going" ? "Cancel my RSVP" : "Leave the waitlist"}</SubmitButton>
          </form>
        ) : (
          <form action={rsvpAction}>
            <input type="hidden" name="id" value={e.id} />
            <input type="hidden" name="going" value="1" />
            <SubmitButton pending="Signing up…">{left > 0 ? "RSVP, I'm going" : "Join the waitlist"}</SubmitButton>
            {left === 0 && <p className="muted" style={{ marginTop: 8 }}>{e.waiting ? `${e.waiting} ahead of you. ` : ""}You&apos;ll get a place automatically if someone cancels.</p>}
          </form>
        )}
      </div>
    </>
  );
}
