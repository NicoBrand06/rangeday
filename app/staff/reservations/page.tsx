import { getDb } from "@/lib/db";
import { STATUS_LABEL, openReservations, price, recentlyClosedReservations, type Reservation } from "@/lib/shop";
import { reservationAction } from "../actions";

function when(sqlUtc: string) {
  // created_at is stored in UTC by SQLite; show it in club time.
  return new Date(sqlUtc.replace(" ", "T") + "Z").toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "2-digit" });
}

function Row({ r }: { r: Reservation }) {
  const [label, tone] = STATUS_LABEL[r.status];
  return (
    <tr>
      <td>PS-{String(r.id).padStart(4, "0")}<br /><span className="muted">{when(r.created_at)}</span></td>
      <td>{r.member_name}<br /><span className="muted">#{r.member_no}</span></td>
      <td><strong>{r.quantity} × {r.item_name}</strong><br /><span className="muted">{r.item_detail} · {price(r.price_cents * r.quantity)}</span></td>
      <td><span className={`pill ${tone}`}>{label}</span>{r.staff_note && <><br /><span className="muted">“{r.staff_note}”</span></>}</td>
      <td style={{ minWidth: 240 }}>
        {(r.status === "pending" || r.status === "confirmed") && (
          <form action={reservationAction} className="actions" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <input type="hidden" name="id" value={r.id} />
            <label className="sr-only" htmlFor={`note-${r.id}`}>Note to member</label>
            <input id={`note-${r.id}`} name="note" className="input" placeholder={r.status === "pending" ? "Note to member (optional)" : "Reason, if declining"} style={{ minHeight: 36, padding: "6px 10px", width: "100%" }} />
            {r.status === "pending" && <button name="to" value="confirmed" className="btn small">Confirm</button>}
            {r.status === "confirmed" && <button name="to" value="picked_up" className="btn small">Picked up</button>}
            <button name="to" value="declined" className="btn small danger">Decline</button>
          </form>
        )}
      </td>
    </tr>
  );
}

export default async function StaffReservations({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const sp = await searchParams;
  const db = await getDb();
  const [open, closed] = await Promise.all([openReservations(db), recentlyClosedReservations(db)]);
  const pending = open.filter((r) => r.status === "pending").length;
  const head = <thead><tr><th>Ref</th><th>Member</th><th>Item</th><th>Status</th><th>Action</th></tr></thead>;
  return (
    <>
      {sp.msg && <p className="note ok" role="status" style={{ marginBottom: 12 }}>{sp.msg}</p>}
      {sp.error && <p className="note error" role="alert" style={{ marginBottom: 12 }}>{sp.error}</p>}
      <section className="panel">
        <h2>Pro shop reservations · {pending} to review</h2>
        <p className="muted" style={{ marginBottom: 10 }}>
          Check the shelf, then confirm (set it aside under the member&apos;s name) or decline with a reason. Members see the status and your note in the app. Payment is taken at pickup.
        </p>
        <div className="table-wrap">
          <table>
            {head}
            <tbody>
              {open.length === 0 && <tr><td colSpan={5} className="empty">No open reservations.</td></tr>}
              {open.map((r) => <Row key={r.id} r={r} />)}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <h2>Recently closed</h2>
        <div className="table-wrap">
          <table>
            {head}
            <tbody>
              {closed.length === 0 && <tr><td colSpan={5} className="empty">Nothing yet.</td></tr>}
              {closed.map((r) => <Row key={r.id} r={r} />)}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
