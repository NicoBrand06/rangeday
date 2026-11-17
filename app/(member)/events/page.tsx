import { requireUser } from "@/lib/auth";
import { getCtx } from "@/lib/context";
import { upcomingEvents } from "@/lib/events";
import EventCard from "@/components/EventCard";

export default async function EventsPage() {
  const user = await requireUser();
  const { db, now } = await getCtx();
  const events = await upcomingEvents(db, user.id, now);
  const mine = events.filter((e) => e.mine);
  return (
    <>
      <div className="bar">
        <h1>Events</h1>
        <p>Shoots, socials and the yearly rodeo</p>
      </div>
      <div className="pad">
        {mine.length > 0 && (
          <>
            <div className="lbl">You&apos;re signed up</div>
            {mine.map((e) => <EventCard key={e.id} e={e} />)}
          </>
        )}
        <div className="lbl">Coming up</div>
        {events.length === 0 && <p className="empty">No events scheduled yet. Check back soon.</p>}
        {events.filter((e) => !e.mine).map((e) => <EventCard key={e.id} e={e} />)}
      </div>
    </>
  );
}
