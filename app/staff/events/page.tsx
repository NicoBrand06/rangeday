import Link from "next/link";
import { getDb } from "@/lib/db";
import { allEvents } from "@/lib/staff";
import { clubNow, prettyDate, prettyTime } from "@/lib/time";

export default async function StaffEvents() {
  const now = clubNow();
  const events = await allEvents(await getDb());
  const upcoming = events.filter((e) => e.date >= now.date);
  return (
    <section className="panel">
      <div className="row" style={{ marginBottom: 10 }}>
        <h2 style={{ marginBottom: 0 }}>Events</h2>
        <span className="spacer" />
        <Link href="/staff/events/new" className="btn small">+ New event</Link>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Event</th><th>Where</th><th>Going</th><th>Status</th><th><span className="sr-only">Edit</span></th></tr></thead>
          <tbody>
            {upcoming.length === 0 && <tr><td colSpan={6} className="empty">No upcoming events.</td></tr>}
            {upcoming.map((e) => (
              <tr key={e.id}>
                <td>{prettyDate(e.date)}<br /><span className="muted">{prettyTime(e.start_time)}</span></td>
                <td><strong>{e.title}</strong><br /><span className="muted">{e.category}</span></td>
                <td>{e.location}</td>
                <td>{e.going} / {e.capacity}</td>
                <td>{e.cancelled ? <span className="pill red">Cancelled</span> : e.going >= e.capacity ? <span className="pill">Full</span> : <span className="pill green">Open</span>}</td>
                <td><Link href={`/staff/events/${e.id}`} className="btn small sec">Manage</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
