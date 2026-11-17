import Link from "next/link";
import { Fragment } from "react";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { getCtx } from "@/lib/context";
import { getInstructor, lessonSchedule } from "@/lib/lessons";
import { addDays, prettyDate, prettyTime } from "@/lib/time";
import InstructorForm from "@/components/InstructorForm";
import SubmitButton from "@/components/SubmitButton";
import { blockDayAction, saveInstructorAction, toggleInstructorAction, unblockDayAction, weeklyHoursAction } from "../actions";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default async function InstructorPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; error?: string; warn?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  await requireStaff();
  const { db, cfg, now } = await getCtx();
  const ins = await getInstructor(db, Number(id));
  if (!ins) notFound();
  const upcoming = (await lessonSchedule(db, now.date, addDays(now.date, 13))).filter((l) => l.instructor_id === ins.id && l.status === "booked");
  const offAhead = ins.timeOff.filter((t) => t.date >= now.date);

  return (
    <>
      <Link href="/staff/lessons" className="link-btn">‹ Lessons</Link>
      <h2 style={{ fontSize: "1.2rem", color: "var(--navy)", margin: "6px 0 12px" }}>
        {ins.name} {!ins.active && <span className="pill">Inactive</span>}
      </h2>
      {sp.msg && <p className="note ok" role="status" style={{ marginBottom: 12 }}>{sp.msg}</p>}
      {sp.warn && <p className="note warn" role="alert" style={{ marginBottom: 12 }}>{sp.warn}</p>}
      {sp.error && <p className="note error" role="alert" style={{ marginBottom: 12 }}>{sp.error}</p>}

      <div className="desk-grid">
        <div>
          <section className="panel">
            <h2>Weekly availability</h2>
            <p className="muted" style={{ marginBottom: 8 }}>Up to two time windows a day (for example, a lunch break). Leave blank for days off. Lessons also have to fit inside club hours.</p>
            <form action={weeklyHoursAction}>
              <input type="hidden" name="id" value={ins.id} />
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Day</th><th>From</th><th>To</th><th>From</th><th>To</th></tr></thead>
                  <tbody>
                    {DAYS.map((name, d) => {
                      const w = ins.hours.filter((h) => Number(h.weekday) === d);
                      return (
                        <tr key={d}>
                          <td>{name}</td>
                          {[0, 1].map((k) => (
                            <Fragment key={k}>
                              <td><label className="sr-only" htmlFor={`s-${d}-${k}`}>{name} window {k + 1} start</label><input id={`s-${d}-${k}`} type="time" step={1800} name={`start-${d}-${k}`} defaultValue={w[k]?.start_time} className="input" style={{ minWidth: 110 }} /></td>
                              <td><label className="sr-only" htmlFor={`e-${d}-${k}`}>{name} window {k + 1} end</label><input id={`e-${d}-${k}`} type="time" step={1800} name={`end-${d}-${k}`} defaultValue={w[k]?.end_time} className="input" style={{ minWidth: 110 }} /></td>
                            </Fragment>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <SubmitButton>Save availability</SubmitButton>
            </form>
          </section>

          <section className="panel">
            <h2>Upcoming lessons (next 2 weeks)</h2>
            {upcoming.length === 0 && <p className="muted">None booked.</p>}
            {upcoming.map((l) => (
              <div key={l.id} className="item" style={{ padding: "8px 0" }}>
                <div style={{ flex: 1 }}>
                  <h4>{prettyDate(l.date)} · {prettyTime(l.start_time)}–{prettyTime(l.end_time)}</h4>
                  <p>{l.member_name} (#{l.member_no})</p>
                </div>
              </div>
            ))}
          </section>
        </div>

        <aside>
          <section className="panel">
            <h2>Block a day off</h2>
            <form action={blockDayAction}>
              <input type="hidden" name="id" value={ins.id} />
              <label className="field"><span>Date</span><input type="date" name="date" className="input" min={now.date} required /></label>
              <label className="field"><span>Reason (staff only, optional)</span><input name="reason" className="input" maxLength={120} /></label>
              <SubmitButton className="btn sec">Block day</SubmitButton>
            </form>
            {offAhead.length > 0 && <div className="lbl">Days off</div>}
            {offAhead.map((t) => (
              <form key={t.date} action={unblockDayAction} className="item" style={{ padding: "6px 0" }}>
                <input type="hidden" name="id" value={ins.id} />
                <input type="hidden" name="date" value={t.date} />
                <div style={{ flex: 1 }}><h4>{prettyDate(t.date)}</h4>{t.reason && <p>{t.reason}</p>}</div>
                <SubmitButton className="btn small sec" pending="…">Remove</SubmitButton>
              </form>
            ))}
          </section>

          <section className="panel">
            <h2>Details</h2>
            <InstructorForm action={saveInstructorAction} areas={cfg.activities} i={ins} />
            <form action={toggleInstructorAction} style={{ marginTop: 10 }}>
              <input type="hidden" name="id" value={ins.id} />
              <input type="hidden" name="active" value={ins.active ? "0" : "1"} />
              <SubmitButton className={`btn ${ins.active ? "danger" : "sec"}`}>{ins.active ? "Deactivate (stop taking lessons)" : "Reactivate"}</SubmitButton>
            </form>
          </section>
        </aside>
      </div>
    </>
  );
}
