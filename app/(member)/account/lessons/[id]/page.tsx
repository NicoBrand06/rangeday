import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getCtx } from "@/lib/context";
import { activityLabel } from "@/lib/config";
import { canMemberCancel, cancelDeadline, isPast } from "@/lib/booking";
import { getLesson } from "@/lib/lessons";
import { prettyDate, prettyTime } from "@/lib/time";
import SubmitButton from "@/components/SubmitButton";
import { cancelLessonAction } from "../../../book/actions";

const STATUS: Record<string, [string, string]> = { booked: ["Confirmed", "green"], cancelled: ["Cancelled", ""], done: ["Done", "green"] };

export default async function LessonDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ new?: string; cancelled?: string; error?: string }> }) {
  const [{ id }, sp, user] = await Promise.all([params, searchParams, requireUser()]);
  const { db, cfg, now } = await getCtx();
  const l = await getLesson(db, Number(id));
  if (!l || l.user_id !== user.id) notFound();
  const upcoming = l.status === "booked" && !isPast(l.date, l.start_time, now);
  const [label, tone] = STATUS[l.status];

  return (
    <>
      <div className="bar">
        <Link href="/account" className="back">‹ My bookings</Link>
        <h1>{sp.new ? "Lesson booked" : "Lesson"}</h1>
        <p>{activityLabel(cfg, l.discipline)}</p>
      </div>
      <div className="pad">
        {sp.new && <p className="note ok" role="status">Done. {l.instructor_name} will see this on their schedule.</p>}
        {sp.cancelled && <p className="note ok" role="status">Lesson cancelled. The time is open again.</p>}
        {sp.error && <p className="note error" role="alert">{sp.error}</p>}
        <div className={`card ${upcoming ? "highlight" : ""}`} style={{ marginTop: 12 }}>
          <div className="card-row">
            <h3 className="grow">With {l.instructor_name}</h3>
            <span className={`pill ${tone}`}>{label}</span>
          </div>
          <dl className="kv" style={{ marginTop: 10 }}>
            <dt>When</dt><dd>{prettyDate(l.date)} · {prettyTime(l.start_time)} to {prettyTime(l.end_time)}</dd>
            <dt>Discipline</dt><dd>{activityLabel(cfg, l.discipline)}</dd>
            <dt>Reference</dt><dd>LS-{String(l.id).padStart(5, "0")}</dd>
          </dl>
          <p style={{ marginTop: 8 }}>Meet your instructor at the front desk 10 minutes before. Pay at the club.</p>
        </div>
        {upcoming &&
          (canMemberCancel(cfg, l.date, now) ? (
            <form action={cancelLessonAction}>
              <input type="hidden" name="id" value={l.id} />
              <SubmitButton className="btn danger" pending="Cancelling…">Cancel lesson</SubmitButton>
              <p className="muted" style={{ marginTop: 8 }}>Free cancellation until {prettyTime(cfg.cancelCutoff)} {prettyDate(cancelDeadline(cfg, l.date).date)}.</p>
            </form>
          ) : (
            <p className="note warn">The cancellation cut-off has passed. To change or cancel, call the front desk.</p>
          ))}
        <Link href="/book/lesson" className="btn sec">Book another lesson</Link>
      </div>
    </>
  );
}
