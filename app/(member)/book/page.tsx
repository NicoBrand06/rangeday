import Link from "next/link";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ACTIVITIES, SLOTS, activityLabel } from "@/lib/club";
import { availability, bookableDates, canMemberCancel, cancelDeadline } from "@/lib/booking";
import { clubNow, prettyDate, prettyTime, weekday } from "@/lib/time";
import Stepper from "@/components/Stepper";
import { bookSlot } from "./actions";

type Search = { activity?: string; date?: string; time?: string; error?: string };

const SLOT_LABEL = { open: "Open", full: "Full", past: "Closed" } as const;

export default async function BookPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const now = clubNow();
  const db = await getDb();

  const dates = bookableDates(now);
  // After the last slot has started, today has nothing left, so start on tomorrow.
  if (now.time >= SLOTS[SLOTS.length - 1]) dates.shift();
  const activity = ACTIVITIES.some((a) => a.key === sp.activity) ? sp.activity! : "clays";
  const date = sp.date && dates.includes(sp.date) ? sp.date : dates[0];
  const slots = await availability(db, activity, date, user.id, now);
  const selected = slots.find((s) => s.time === sp.time && (s.status === "open" || s.status === "few"));

  const href = (p: Partial<Search>) => {
    const q = new URLSearchParams({ activity, date, ...p });
    if (!p.time) q.delete("time");
    return `/book?${q}`;
  };

  return (
    <>
      <div className="bar">
        <h1>Book: {activityLabel(activity)}</h1>
        <p>Pick a day and an open time</p>
      </div>
      <div className="pad">
        <nav className="chips" aria-label="Activity">
          {ACTIVITIES.map((a) => (
            <Link key={a.key} href={`/book?activity=${a.key}&date=${date}`} className={`chip ${a.key === activity ? "on" : ""}`} aria-current={a.key === activity ? "true" : undefined}>
              {a.short}
            </Link>
          ))}
        </nav>

        <nav className="days" aria-label="Day">
          {dates.map((d) => (
            <Link key={d} href={href({ date: d })} className={d === date ? "on" : ""} aria-current={d === date ? "date" : undefined}>
              {d === now.date ? "Today" : weekday(d)}
              <b>{Number(d.slice(8))}</b>
            </Link>
          ))}
        </nav>

        {sp.error && <p className="note error" role="alert">{sp.error}</p>}

        <div className="lbl">{prettyDate(date)} · tap a time</div>
        <div className="slots">
          {slots.map((s) => {
            const bookable = s.status === "open" || s.status === "few";
            const isSel = selected?.time === s.time;
            const label = isSel ? "Selected" : s.mine ? "Your booking" : s.status === "few" ? `${s.free.length} left` : SLOT_LABEL[s.status as keyof typeof SLOT_LABEL];
            const cls = `slot ${isSel ? "sel" : s.mine ? "mine" : s.status}`;
            return bookable && !s.mine ? (
              <Link key={s.time} href={href({ time: s.time })} className={cls} scroll={false}>
                {prettyTime(s.time).replace(" ", " ")}
                <small>{label}</small>
              </Link>
            ) : (
              <div key={s.time} className={cls} aria-disabled>
                {prettyTime(s.time).replace(" ", " ")}
                <small>{label}</small>
              </div>
            );
          })}
        </div>
        <div className="legend" aria-hidden>
          <span><i />Open</span>
          <span><i style={{ borderColor: "var(--amber-border)", borderWidth: 2 }} />1–2 stations left</span>
          <span><i style={{ background: "var(--gl)" }} />Full</span>
        </div>

        {selected ? (
          <form action={bookSlot} id="confirm">
            <input type="hidden" name="activity" value={activity} />
            <input type="hidden" name="date" value={date} />
            <input type="hidden" name="time" value={selected.time} />

            <div className="lbl">Station</div>
            <div className="chips" role="radiogroup" aria-label="Station">
              {selected.free.map((st, i) => (
                <label key={st.id} className="chip" style={{ cursor: "pointer" }}>
                  <input type="radio" name="station" value={st.id} defaultChecked={i === 0} style={{ marginRight: 6 }} />
                  {st.name.split(", ")[1] ?? st.name}
                </label>
              ))}
            </div>

            <div className="lbl">Party</div>
            <Stepper kind="party" name="party" max={Math.max(...selected.free.map((s) => s.capacity))} />

            <button className="btn">Confirm {prettyTime(selected.time)} booking</button>
            <p className="note">
              {canMemberCancel(date, now)
                ? `Free cancellation in the app until 6 pm ${prettyDate(cancelDeadline(date).date)}.`
                : "It's past the 6 pm cut-off for this day, so after you confirm, any change goes through the front desk."}
            </p>
          </form>
        ) : (
          <p className="note">Full slot? Try another station type or day. A waitlist is on the roadmap.</p>
        )}
      </div>
    </>
  );
}
