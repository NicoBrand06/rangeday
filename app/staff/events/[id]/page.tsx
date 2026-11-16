import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { attendees } from "@/lib/staff";
import { getEvent } from "@/lib/events";
import { clubNow } from "@/lib/time";
import EventForm from "@/components/EventForm";
import { cancelEventAction } from "../../actions";

export default async function ManageEvent({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; error?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const db = await getDb();
  const e = await getEvent(db, Number(id), 0);
  if (!e) notFound();
  const list = await attendees(db, e.id);
  return (
    <div className="desk-grid">
      <section className="panel">
        <Link href="/staff/events" className="link-btn">‹ All events</Link>
        <div className="row" style={{ marginTop: 6 }}>
          <h2 style={{ marginBottom: 0 }}>{e.title}</h2>
          {e.cancelled ? <span className="pill red">Cancelled</span> : null}
        </div>
        {sp.msg && <p className="note ok" role="status">{sp.msg}</p>}
        {sp.error && <p className="note error" role="alert">{sp.error}</p>}
        <EventForm id={e.id} e={e} minDate={clubNow().date} />
        <form action={cancelEventAction}>
          <input type="hidden" name="id" value={e.id} />
          <input type="hidden" name="cancel" value={e.cancelled ? "0" : "1"} />
          <button className={`btn ${e.cancelled ? "sec" : "danger"}`}>{e.cancelled ? "Reinstate event" : "Cancel event"}</button>
        </form>
      </section>
      <aside className="panel">
        <h2>Going ({list.length} of {e.capacity})</h2>
        {list.length === 0 && <p className="muted">No RSVPs yet.</p>}
        <ol style={{ paddingLeft: 20 }}>
          {list.map((a) => <li key={a.member_no}>{a.name} <span className="muted">#{a.member_no}</span></li>)}
        </ol>
      </aside>
    </div>
  );
}
