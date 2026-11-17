import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { getCtx } from "@/lib/context";
import { activityLabel, allSlots } from "@/lib/config";
import { listInstructors, lessonSchedule } from "@/lib/lessons";
import { members } from "@/lib/staff";
import { addDays, prettyDate, prettyTime } from "@/lib/time";
import SubmitButton from "@/components/SubmitButton";
import { staffBookLessonAction, staffCancelLessonAction } from "../instructors/actions";

export default async function StaffLessons({ searchParams }: { searchParams: Promise<{ date?: string; view?: string; msg?: string; error?: string }> }) {
  const sp = await searchParams;
  await requireStaff();
  const { db, cfg, now } = await getCtx();
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : now.date;
  const week = sp.view === "week";
  const to = week ? addDays(date, 6) : date;
  const [lessons, instructors, memberList] = await Promise.all([lessonSchedule(db, date, to), listInstructors(db), members(db)]);
  const shown = lessons.filter((l) => l.status !== "cancelled");
  const q = (p: Record<string, string>) => `/staff/lessons?${new URLSearchParams({ date, ...(week ? { view: "week" } : {}), ...p })}`;

  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        <Link className="btn small sec" href={q({ date: addDays(date, week ? -7 : -1) })} aria-label="Earlier">‹</Link>
        <h2 style={{ fontSize: "1.2rem", color: "var(--navy)" }}>Lessons · {prettyDate(date)}{week ? ` to ${prettyDate(to)}` : ""}</h2>
        <Link className="btn small sec" href={q({ date: addDays(date, week ? 7 : 1) })} aria-label="Later">›</Link>
        <span className="spacer" />
        <Link className={`chip ${!week ? "on" : ""}`} href={`/staff/lessons?date=${date}`}>Day</Link>
        <Link className={`chip ${week ? "on" : ""}`} href={`/staff/lessons?date=${date}&view=week`}>Week</Link>
      </div>
      {sp.msg && <p className="note ok" role="status" style={{ marginBottom: 12 }}>{sp.msg}</p>}
      {sp.error && <p className="note error" role="alert" style={{ marginBottom: 12 }}>{sp.error}</p>}

      <div className="desk-grid">
        <section className="panel">
          <h2>Schedule · {shown.length} {shown.length === 1 ? "lesson" : "lessons"}</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>When</th><th>Instructor</th><th>Member</th><th>Discipline</th><th>Source</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {shown.length === 0 && <tr><td colSpan={6} className="empty">No lessons booked.</td></tr>}
                {shown.map((l) => (
                  <tr key={l.id}>
                    <td>{week && <>{prettyDate(l.date)}<br /></>}{prettyTime(l.start_time)}–{prettyTime(l.end_time)}</td>
                    <td><Link href={`/staff/instructors/${l.instructor_id}`} style={{ textDecoration: "underline" }}>{l.instructor_name}</Link></td>
                    <td>{l.member_name}<br /><span className="muted">#{l.member_no}</span></td>
                    <td>{activityLabel(cfg, l.discipline)}</td>
                    <td>{l.source === "app" ? "App" : "Phone"}</td>
                    <td>
                      {l.status === "booked" && (l.date > now.date || (l.date === now.date && l.start_time > now.time)) && (
                        <form action={staffCancelLessonAction}>
                          <input type="hidden" name="id" value={l.id} />
                          <input type="hidden" name="date" value={date} />
                          <SubmitButton className="btn small danger" pending="…">Cancel</SubmitButton>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <aside>
          <section className="panel">
            <h2>Instructors</h2>
            {instructors.map((i) => (
              <Link key={i.id} href={`/staff/instructors/${i.id}`} className="item" style={{ padding: "8px 0" }}>
                <div style={{ flex: 1 }}>
                  <h4>{i.name}</h4>
                  <p>{i.specialty}</p>
                </div>
                {!i.active && <span className="pill">Inactive</span>}
              </Link>
            ))}
            <Link href="/staff/instructors" className="btn small sec" style={{ marginTop: 10 }}>+ Add instructor</Link>
          </section>

          <section className="panel">
            <h2>+ Book a lesson for a member</h2>
            <form action={staffBookLessonAction}>
              <label className="field"><span>Member</span>
                <select name="member" className="input" required defaultValue="">
                  <option value="" disabled>Choose a member…</option>
                  {memberList.map((m) => <option key={m.id} value={m.id}>{m.name} (#{m.member_no})</option>)}
                </select>
              </label>
              <label className="field"><span>Instructor</span>
                <select name="instructor" className="input">
                  {instructors.filter((i) => i.active).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
              </label>
              <label className="field"><span>Discipline</span>
                <select name="discipline" className="input">
                  {cfg.activities.filter((a) => a.active).map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
                </select>
              </label>
              <div className="row">
                <label className="field" style={{ flex: 1 }}><span>Date</span><input type="date" name="date" className="input" defaultValue={date} min={now.date} /></label>
                <label className="field" style={{ flex: 1 }}><span>Time</span>
                  <select name="time" className="input">{allSlots(cfg).map((t) => <option key={t} value={t}>{prettyTime(t)}</option>)}</select>
                </label>
              </div>
              <SubmitButton pending="Booking…">Book lesson</SubmitButton>
              <p className="muted" style={{ marginTop: 6 }}>Checks the instructor&apos;s hours, days off and other lessons, the same as the app.</p>
            </form>
          </section>
        </aside>
      </div>
    </>
  );
}
