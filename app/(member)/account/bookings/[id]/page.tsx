import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getCtx } from "@/lib/context";
import { activityLabel } from "@/lib/config";
import { canMemberCancel, cancelDeadline, getBooking, isPast } from "@/lib/booking";
import { prettyDate, prettyTime } from "@/lib/time";
import SubmitButton from "@/components/SubmitButton";
import { cancelMyBooking } from "../../../book/actions";

const STATUS: Record<string, [string, string]> = {
  booked: ["Confirmed", "green"],
  checked_in: ["Checked in", "green"],
  no_show: ["No-show", "red"],
  cancelled: ["Cancelled", ""],
};

export default async function BookingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ new?: string; cancelled?: string; error?: string }> }) {
  const [{ id }, sp, user] = await Promise.all([params, searchParams, requireUser()]);
  const { db, cfg, now } = await getCtx();
  const b = await getBooking(db, Number(id));
  if (!b || b.user_id !== user.id) notFound();
  const upcoming = b.status === "booked" && !isPast(b.date, b.start_time, now);
  const [label, tone] = STATUS[b.status];
  const shared = Boolean(Number(b.shared));

  return (
    <>
      <div className="bar">
        <Link href="/account" className="back">‹ My bookings</Link>
        <h1>{sp.new ? "You're booked" : "Booking"}</h1>
        <p>{activityLabel(cfg, b.activity)}</p>
      </div>
      <div className="pad">
        {sp.new && <p className="note ok" role="status">Done. The front desk can see this booking now.</p>}
        {sp.cancelled && <p className="note ok" role="status">Cancelled. The time is open for other members again.</p>}
        {sp.error && <p className="note error" role="alert">{sp.error}</p>}

        <div className={`card ${upcoming ? "highlight" : ""}`} style={{ marginTop: 12 }}>
          <div className="card-row">
            <h3 className="grow">{b.station_name}</h3>
            <span className={`pill ${tone}`}>{label}</span>
          </div>
          <dl className="kv" style={{ marginTop: 10 }}>
            <dt>When</dt><dd>{prettyDate(b.date)} · {prettyTime(b.start_time)} (30 min)</dd>
            <dt>Party</dt><dd>{b.party_size === 1 ? "Just you" : `${b.party_size} people`}</dd>
            <dt>Booked via</dt><dd>{b.source === "app" ? "App" : "Front desk (phone)"}</dd>
            <dt>Reference</dt><dd>RD-{String(b.id).padStart(5, "0")}</dd>
          </dl>
          {shared && <p style={{ marginTop: 8 }}>Shared area: other members may be there at the same time.</p>}
        </div>

        {upcoming &&
          (canMemberCancel(cfg, b.date, now) ? (
            <form action={cancelMyBooking}>
              <input type="hidden" name="id" value={b.id} />
              <SubmitButton className="btn danger" pending="Cancelling…">Cancel booking</SubmitButton>
              <p className="muted" style={{ marginTop: 8 }}>
                Free cancellation until {prettyTime(cfg.cancelCutoff)} {prettyDate(cancelDeadline(cfg, b.date).date)}.
              </p>
            </form>
          ) : (
            <p className="note warn">The {prettyTime(cfg.cancelCutoff)} cut-off has passed. To change or cancel, call the front desk.</p>
          ))}

        <Link href="/book" className="btn sec">Book another session</Link>
      </div>
    </>
  );
}
