import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { getCtx } from "@/lib/context";
import { describeRule, getEvent, getSeries, signupLists } from "@/lib/events";
import EventForm from "@/components/EventForm";
import SubmitButton from "@/components/SubmitButton";
import { cancelEventAction } from "../actions";

export default async function ManageEvent({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; error?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  await requireStaff();
  const { db, now } = await getCtx();
  const e = await getEvent(db, Number(id), 0);
  if (!e) notFound();
  const [lists, series] = await Promise.all([signupLists(db, e.id), getSeries(db, e.series_id)]);
  return (
    <div className="desk-grid">
      <section className="panel">
        <Link href="/staff/events" className="link-btn">‹ All events</Link>
        <div className="row" style={{ marginTop: 6 }}>
          <h2 style={{ marginBottom: 0 }}>{e.title}</h2>
          {e.cancelled ? <span className="pill red">Cancelled</span> : null}
          {series && <span className="pill">{describeRule(series)}{series.active ? "" : " (ended)"}</span>}
        </div>
        {sp.msg && <p className="note ok" role="status">{sp.msg}</p>}
        {sp.error && <p className="note error" role="alert">{sp.error}</p>}
        <EventForm id={e.id} e={e} minDate={now.date} inSeries={!!e.series_id} />
        <div className="row" style={{ marginTop: 12 }}>
          <form action={cancelEventAction}>
            <input type="hidden" name="id" value={e.id} />
            <input type="hidden" name="cancel" value={e.cancelled ? "0" : "1"} />
            <SubmitButton className={`btn small ${e.cancelled ? "sec" : "danger"}`}>{e.cancelled ? "Reinstate this date" : "Cancel this date"}</SubmitButton>
          </form>
          {series?.active && !e.cancelled ? (
            <form action={cancelEventAction}>
              <input type="hidden" name="id" value={e.id} />
              <input type="hidden" name="cancel" value="1" />
              <input type="hidden" name="scope" value="future" />
              <SubmitButton className="btn small danger">Cancel this and all later dates</SubmitButton>
            </form>
          ) : null}
        </div>
      </section>
      <aside>
        <section className="panel">
          <h2>Going ({lists.going.length} of {e.capacity})</h2>
          {lists.going.length === 0 && <p className="muted">No sign-ups yet.</p>}
          <ol style={{ paddingLeft: 20 }}>
            {lists.going.map((a) => <li key={a.member_no}>{a.name} <span className="muted">#{a.member_no}</span></li>)}
          </ol>
        </section>
        <section className="panel">
          <h2>Waitlist ({lists.waitlist.length})</h2>
          {lists.waitlist.length === 0 ? (
            <p className="muted">Nobody waiting.</p>
          ) : (
            <>
              <p className="muted" style={{ marginBottom: 6 }}>In order. When a place opens (a cancellation or more places), the first person moves up automatically.</p>
              <ol style={{ paddingLeft: 20 }}>
                {lists.waitlist.map((a) => <li key={a.member_no}>{a.name} <span className="muted">#{a.member_no}</span></li>)}
              </ol>
            </>
          )}
        </section>
      </aside>
    </div>
  );
}
