import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getCtx } from "@/lib/context";
import { activityFor, slotsFor } from "@/lib/config";
import { availability, bookableDates, canMemberCancel, cancelDeadline, isPast } from "@/lib/booking";
import { busyByArea } from "@/lib/busy";
import { MAX_VISIT_PARTY, visitsOn } from "@/lib/visits";
import { prettyDate, prettyTime } from "@/lib/time";
import AreaChips from "@/components/AreaChips";
import BusyMeter from "@/components/BusyMeter";
import DayPicker from "@/components/DayPicker";
import Stepper from "@/components/Stepper";
import SubmitButton from "@/components/SubmitButton";
import { bookSlot, cancelVisitAction, planVisitAction } from "./actions";

type Search = { activity?: string; date?: string; time?: string; error?: string; planned?: string; visitCancelled?: string };

const SLOT_LABEL = { open: "Open", full: "Full", past: "Closed" } as const;

export default async function BookPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const { db, cfg, now } = await getCtx();
  const areas = cfg.activities.filter((a) => a.active);

  const dates = bookableDates(cfg, now);
  // After the last slot has started, today has nothing left, so start on tomorrow.
  const todaySlots = slotsFor(cfg, now.date);
  if (!todaySlots.length || now.time >= todaySlots[todaySlots.length - 1]) dates.shift();
  const area = activityFor(cfg, sp.activity ?? "") ?? areas.find((a) => a.mode !== "walkaround") ?? areas[0];
  const date = sp.date && dates.includes(sp.date) ? sp.date : dates[0];

  if (!area) return <p className="pad empty">No areas are set up yet.</p>;

  const href = (p: Partial<Search>) => {
    const q = new URLSearchParams({ activity: area.key, date, ...p });
    if (!p.time) q.delete("time");
    return `/book?${q}`;
  };

  const intro =
    area.mode === "walkaround"
      ? "Walk-around course: no booking needed"
      : area.mode === "shared"
        ? `Shared area: up to ${area.perSlot} people per time`
        : "Pick a day and an open time";

  return (
    <>
      <div className="bar">
        <h1>Book: {area.label}</h1>
        <p>{intro}</p>
      </div>
      <div className="pad">
        <AreaChips areas={areas} current={area.key} date={date} />
        <DayPicker dates={dates} current={date} today={now.date} href={(d) => href({ date: d })} />
        {sp.error && <p className="note error" role="alert">{sp.error}</p>}
        {area.mode === "walkaround" ? (
          <WalkAround userId={user.id} areaKey={area.key} date={date} planned={!!sp.planned} cancelled={!!sp.visitCancelled} />
        ) : (
          <Slots userId={user.id} areaKey={area.key} date={date} time={sp.time} href={href} />
        )}
      </div>
    </>
  );
}

/** Slot-booked fields and shared areas. */
async function Slots({ userId, areaKey, date, time, href }: { userId: number; areaKey: string; date: string; time?: string; href: (p: Partial<Search>) => string }) {
  const { db, cfg, now } = await getCtx();
  const area = activityFor(cfg, areaKey)!;
  const shared = area.mode === "shared";
  const slots = await availability(db, cfg, area.key, date, userId, now);
  const selected = slots.find((s) => s.time === time && (s.status === "open" || s.status === "few") && !s.mine);

  if (!slots.length) return <p className="note">The club is closed on {prettyDate(date)}. Pick another day.</p>;

  const labelFor = (s: (typeof slots)[number]) => {
    if (selected?.time === s.time) return "Selected";
    if (s.mine) return "Your booking";
    if (s.status === "past") return "Closed";
    if (shared) return s.status === "full" ? "Full" : `${s.people} of ${s.limit} booked`;
    return s.status === "few" ? `${s.free.length} left` : SLOT_LABEL[s.status as keyof typeof SLOT_LABEL];
  };

  return (
    <>
      <div className="lbl">{prettyDate(date)} · tap a time</div>
      <div className="slots">
        {slots.map((s) => {
          const bookable = (s.status === "open" || s.status === "few") && !s.mine;
          const cls = `slot ${selected?.time === s.time ? "sel" : s.mine ? "mine" : s.status}`;
          return bookable ? (
            <Link key={s.time} href={href({ time: s.time })} className={cls} scroll={false}>
              {prettyTime(s.time)}
              <small>{labelFor(s)}</small>
            </Link>
          ) : (
            <div key={s.time} className={cls} aria-disabled>
              {prettyTime(s.time)}
              <small>{labelFor(s)}</small>
            </div>
          );
        })}
      </div>
      <div className="legend" aria-hidden>
        <span><i />Open</span>
        {(shared || (slots[0]?.total ?? 0) > 1) && <span><i style={{ borderColor: "var(--amber-border)", borderWidth: 2 }} />{shared ? "1–2 places left" : "1–2 fields left"}</span>}
        <span><i style={{ background: "var(--gl)" }} />Full</span>
      </div>

      {selected ? (
        <form action={bookSlot} id="confirm">
          <input type="hidden" name="activity" value={area.key} />
          <input type="hidden" name="date" value={date} />
          <input type="hidden" name="time" value={selected.time} />

          {shared ? (
            <>
              <input type="hidden" name="station" value={selected.free[0].id} />
              <p className="note">
                <strong>{selected.people} of {selected.limit} booked</strong> at {prettyTime(selected.time)}. This is a shared area, so others may be there with you.
              </p>
            </>
          ) : selected.free.length === 1 && selected.total === 1 ? (
            <input type="hidden" name="station" value={selected.free[0].id} />
          ) : (
            <>
              <div className="lbl">Field</div>
              <div className="chips" role="radiogroup" aria-label="Field">
                {selected.free.map((st, i) => (
                  <label key={st.id} className="chip" style={{ cursor: "pointer" }}>
                    <input type="radio" name="station" value={st.id} defaultChecked={i === 0} style={{ marginRight: 6 }} />
                    {st.name.split(", ")[1] ?? st.name}
                  </label>
                ))}
              </div>
            </>
          )}

          <div className="lbl">Party</div>
          <Stepper
            kind="party"
            name="party"
            max={shared ? Math.min(selected.spotsLeft ?? 1, ...selected.free.map((s) => s.capacity)) : Math.max(...selected.free.map((s) => s.capacity))}
            hint={shared ? `${selected.spotsLeft} ${selected.spotsLeft === 1 ? "place" : "places"} left at this time` : undefined}
          />

          <SubmitButton pending="Booking…">Confirm {prettyTime(selected.time)} booking</SubmitButton>
          <p className="note">
            {canMemberCancel(cfg, date, now)
              ? `Free cancellation in the app until ${prettyTime(cfg.cancelCutoff)} ${prettyDate(cancelDeadline(cfg, date).date)}.`
              : `It's past the ${prettyTime(cfg.cancelCutoff)} cut-off for this day, so after you confirm, any change goes through the front desk.`}
          </p>
        </form>
      ) : (
        <p className="note">{shared ? "Full at a time you want? Try another time or day." : "Full slot? Try another area or day."}</p>
      )}
    </>
  );
}

/** Walk-around course: no booking, a busy forecast and an optional "Planning to come?". */
async function WalkAround({ userId, areaKey, date, planned, cancelled }: { userId: number; areaKey: string; date: string; planned: boolean; cancelled: boolean }) {
  const { db, cfg, now } = await getCtx();
  const area = activityFor(cfg, areaKey)!;
  const meter = (await busyByArea(db, cfg, date, now)).find((a) => a.activity === area.key);
  const mine = (await visitsOn(db, date, area.key)).find((v) => v.user_id === userId && v.kind === "expected");
  const times = slotsFor(cfg, date).filter((t) => !isPast(date, t, now));

  return (
    <>
      {planned && <p className="note ok" role="status">Thanks! Your visit is on the forecast. Just check in at the front desk when you arrive.</p>}
      {cancelled && <p className="note ok" role="status">Planned visit removed.</p>}
      <div className="lbl">How busy on {prettyDate(date)}</div>
      <BusyMeter hours={meter?.hours ?? []} now={now} date={date} title={area.label} basis="Check-ins + planned visits" id="course" />
      <p className="note">
        The {area.label.toLowerCase()} course is walk-around: just turn up and check in at the front desk. It never gets &quot;full&quot;, but it can get busy.
      </p>

      {mine ? (
        <div className="card highlight">
          <h3>You&apos;re planning to come at {prettyTime(mine.time)}</h3>
          <p>{mine.party_size === 1 ? "Just you" : `${mine.party_size} people`} · not a booking, just helps everyone see how busy it will be</p>
          <form action={cancelVisitAction} style={{ marginTop: 8 }}>
            <input type="hidden" name="id" value={mine.id} />
            <input type="hidden" name="back" value={`/book?activity=${area.key}&date=${date}`} />
            <SubmitButton className="btn small danger" pending="Removing…">Not coming after all</SubmitButton>
          </form>
        </div>
      ) : times.length ? (
        <form action={planVisitAction}>
          <input type="hidden" name="activity" value={area.key} />
          <input type="hidden" name="date" value={date} />
          <div className="lbl">Planning to come? (optional)</div>
          <label className="field">
            <span>Roughly when</span>
            <select className="input" name="time" defaultValue={times[0]}>
              {times.map((t) => <option key={t} value={t}>{prettyTime(t)}</option>)}
            </select>
          </label>
          <Stepper kind="party" name="party" max={MAX_VISIT_PARTY} hint="How many in your group" />
          <SubmitButton className="btn sec" pending="Adding…">Add me to the forecast</SubmitButton>
        </form>
      ) : (
        <p className="note">The club has closed for the day.</p>
      )}
    </>
  );
}
