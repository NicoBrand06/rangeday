import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getCtx } from "@/lib/context";
import { activityLabel, slotsFor } from "@/lib/config";
import { bookableDates, canMemberCancel, cancelDeadline } from "@/lib/booking";
import { availableInstructors, listInstructors } from "@/lib/lessons";
import { addMinutesLabel, prettyDate, prettyTime } from "@/lib/time";
import AreaChips from "@/components/AreaChips";
import DayPicker from "@/components/DayPicker";
import SubmitButton from "@/components/SubmitButton";
import { bookLessonAction } from "../actions";

type Search = { discipline?: string; date?: string; instructor?: string; time?: string; error?: string };

export default async function LessonPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  await requireUser();
  const { db, cfg, now } = await getCtx();
  const areas = cfg.activities.filter((a) => a.active);

  // Only disciplines that at least one active instructor teaches.
  const instructors = await listInstructors(db, true);
  const taught = areas.filter((a) => instructors.some((i) => i.disciplines.includes(a.key)));
  const discipline = taught.find((a) => a.key === sp.discipline)?.key ?? taught[0]?.key;
  const dates = bookableDates(cfg, now);
  const todaySlots = slotsFor(cfg, now.date);
  if (!todaySlots.length || now.time >= todaySlots[todaySlots.length - 1]) dates.shift(); // nothing left today
  const date = sp.date && dates.includes(sp.date) ? sp.date : dates[0];
  const href = (p: Partial<Search>) => {
    const q = new URLSearchParams({ discipline: discipline ?? "", date, ...p });
    return `/book/lesson?${q}`;
  };

  const options = discipline ? await availableInstructors(db, cfg, discipline, date, now) : [];
  const chosen = options.find((o) => o.instructor.id === Number(sp.instructor) && o.times.includes(sp.time ?? ""));

  return (
    <>
      <div className="bar">
        <h1>Book a lesson</h1>
        <p>{cfg.lessonMinutes}-minute lessons with our instructors</p>
      </div>
      <div className="pad">
        <AreaChips areas={areas} current="lesson" date={date} />

        {!taught.length ? (
          <p className="note">No instructors are taking lessons right now. Please ask at the front desk.</p>
        ) : (
          <>
            <div className="lbl">Discipline</div>
            <nav className="chips" aria-label="Discipline">
              {taught.map((a) => (
                <Link key={a.key} href={`/book/lesson?discipline=${a.key}&date=${date}`} className={`chip ${a.key === discipline ? "on" : ""}`} aria-current={a.key === discipline ? "true" : undefined}>
                  {a.label}
                </Link>
              ))}
            </nav>
            <DayPicker dates={dates} current={date} today={now.date} href={(d) => href({ date: d })} />
            {sp.error && <p className="note error" role="alert">{sp.error}</p>}

            <div className="lbl">{activityLabel(cfg, discipline!)} instructors · {prettyDate(date)}</div>
            {options.length === 0 && <p className="note">Nobody teaches {activityLabel(cfg, discipline!).toLowerCase()} on {prettyDate(date)}. Try another day.</p>}
            {options.map(({ instructor, times }) => (
              <section key={instructor.id} className="card" aria-labelledby={`ins-${instructor.id}`}>
                <h3 id={`ins-${instructor.id}`}>{instructor.name}</h3>
                <p>{instructor.specialty}</p>
                {times.length ? (
                  <div className="slots" style={{ marginTop: 10 }}>
                    {times.map((t) => {
                      const on = chosen?.instructor.id === instructor.id && sp.time === t;
                      return (
                        <Link key={t} href={href({ instructor: String(instructor.id), time: t })} className={`slot ${on ? "sel" : ""}`} scroll={false} aria-current={on ? "true" : undefined}>
                          {prettyTime(t)}
                          <small>{on ? "Selected" : "Open"}</small>
                        </Link>
                      );
                    })}
                  </div>
                ) : (
                  <p className="pill" style={{ marginTop: 8 }}>Fully booked this day</p>
                )}
              </section>
            ))}

            {chosen && (
              <form action={bookLessonAction} id="confirm">
                <input type="hidden" name="discipline" value={discipline} />
                <input type="hidden" name="date" value={date} />
                <input type="hidden" name="instructor" value={chosen.instructor.id} />
                <input type="hidden" name="time" value={sp.time} />
                <div className="card highlight">
                  <h3>{activityLabel(cfg, discipline!)} lesson with {chosen.instructor.name}</h3>
                  <p>{prettyDate(date)} · {prettyTime(sp.time!)} to {addMinutesLabel(sp.time!, cfg.lessonMinutes)}</p>
                </div>
                <SubmitButton pending="Booking…">Book this lesson</SubmitButton>
                <p className="note">
                  {canMemberCancel(cfg, date, now)
                    ? `Free cancellation in the app until ${prettyTime(cfg.cancelCutoff)} ${prettyDate(cancelDeadline(cfg, date).date)}. Pay the instructor at the club.`
                    : "It's past the cancellation cut-off for this day, so any change goes through the front desk."}
                </p>
              </form>
            )}
          </>
        )}
      </div>
    </>
  );
}
