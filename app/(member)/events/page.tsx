import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { upcomingEvents } from "@/lib/events";
import { clubNow } from "@/lib/time";
import EventCard from "@/components/EventCard";

export default async function EventsPage() {
  const user = await requireUser();
  const events = await upcomingEvents(await getDb(), user.id, clubNow());
  const mine = events.filter((e) => e.mine);
  return (
    <>
      <div className="bar">
        <h1>Events</h1>
        <p>Clinics, leagues and socials at the club</p>
      </div>
      <div className="pad">
        {mine.length > 0 && (
          <>
            <div className="lbl">You&apos;re going</div>
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
