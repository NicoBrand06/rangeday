import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { getCtx } from "@/lib/context";
import { staffEventList } from "@/lib/events";
import { prettyDate, prettyTime } from "@/lib/time";

export default async function StaffEvents() {
  await requireStaff();
  const { db, now } = await getCtx();
  const events = await staffEventList(db, now);
  return (
    <section className="panel">
      <div className="row" style={{ marginBottom: 10 }}>
        <h2 style={{ marginBottom: 0 }}>Events</h2>
        <span className="spacer" />
        <Link href="/staff/events/new" className="btn small">+ New event</Link>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Event</th><th>Repeats</th><th>Going</th><th>Waitlist</th><th>Status</th><th><span className="sr-only">Manage</span></th></tr></thead>
          <tbody>
            {events.length === 0 && <tr><td colSpan={7} className="empty">No upcoming events.</td></tr>}
            {events.map((e) => (
              <tr key={e.id}>
                <td>{prettyDate(e.date)}<br /><span className="muted">{prettyTime(e.start_time)}</span></td>
                <td><strong>{e.title}</strong><br /><span className="muted">{e.category} · {e.location}</span></td>
                <td>{e.repeat ?? <span className="muted">One-off</span>}</td>
                <td>{e.going} / {e.capacity}</td>
                <td>{e.waiting || ""}</td>
                <td>{e.cancelled ? <span className="pill red">Cancelled</span> : e.going >= e.capacity ? <span className="pill amber">Full</span> : <span className="pill green">Open</span>}</td>
                <td><Link href={`/staff/events/${e.id}`} className="btn small sec">Manage</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
