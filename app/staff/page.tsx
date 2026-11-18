import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { getCtx } from "@/lib/context";
import { demoMode } from "@/lib/db";
import { slotsFor } from "@/lib/config";
import { busyByArea, clubWide } from "@/lib/busy";
import { lessonSchedule } from "@/lib/lessons";
import { bookingsOn, dayStats, members, type DeskBooking } from "@/lib/staff";
import { openReservations } from "@/lib/shop";
import { visitsOn } from "@/lib/visits";
import { requestCounts } from "@/lib/requests";
import { addDays, prettyDate, prettyTime } from "@/lib/time";
import AreaBusyList from "@/components/AreaBusyList";
import BusyMeter from "@/components/BusyMeter";
import SubmitButton from "@/components/SubmitButton";
import { attendanceAction, phoneBookingAction, resetDemoAction, staffCancelAction, visitCheckInAction, walkInAction } from "./actions";

type Search = { date?: string; msg?: string; error?: string; show?: string; welcome?: string };

function StatusTag({ b, started }: { b: DeskBooking; started: boolean }) {
  if (b.status === "checked_in") return <span className="pill green">Checked in</span>;
  if (b.status === "no_show") return <span className="pill red">No-show</span>;
  if (b.status === "cancelled") return <span className="pill">Cancelled</span>;
  return started ? <span className="pill amber">Not checked in</span> : <span className="pill">Due</span>;
}

function Act({ action, id, date, to, label, cls = "sec" }: { action: (f: FormData) => Promise<void>; id: number; date: string; to?: string; label: string; cls?: string }) {
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="date" value={date} />
      {to && <input type="hidden" name="to" value={to} />}
      <SubmitButton className={`btn small ${cls}`} pending="…">{label}</SubmitButton>
    </form>
  );
}

export default async function StaffToday({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  await requireStaff();
  const { db, cfg, now } = await getCtx();
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : now.date;
  const walkaround = cfg.activities.filter((a) => a.active && a.mode === "walkaround");
  const [rows, areas, memberList, stations, pending, lessons, visits, requests] = await Promise.all([
    bookingsOn(db, date),
    busyByArea(db, cfg, date, now),
    members(db),
    db
      .execute("SELECT s.id, s.name, s.capacity FROM stations s JOIN activities a ON a.key = s.activity WHERE s.active = 1 AND a.active = 1 AND a.mode != 'walkaround' ORDER BY a.sort, s.id")
      .then((r) => r.rows as unknown as { id: number; name: string; capacity: number }[]),
    openReservations(db, cfg).then((r) => r.filter((x) => x.status === "pending")),
    lessonSchedule(db, date, date).then((l) => l.filter((x) => x.status === "booked")),
    walkaround.length ? visitsOn(db, date, walkaround[0].key) : Promise.resolve([]),
    requestCounts(db).then((c) => c.byStatus),
  ]);
  const stats = dayStats(rows, now, date);
  const club = clubWide(areas);
  const peak = Math.max(0, ...club.map((h) => h.pct));
  const showCancelled = sp.show === "all";
  const visible = rows.filter((r) => showCancelled || r.status !== "cancelled");
  const isToday = date === now.date;
  const isPastDay = date < now.date;
  const times = slotsFor(cfg, date).filter((t) => !isToday || t > now.time);
  const onCourse = visits.filter((v) => v.kind === "checked_in");
  const expected = visits.filter((v) => v.kind === "expected");

  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        <Link className="btn small sec" href={`/staff?date=${addDays(date, -1)}`} aria-label="Previous day">‹</Link>
        <h2 style={{ fontSize: "1.2rem", color: "var(--navy)" }}>{isToday ? "Today · " : ""}{prettyDate(date)}</h2>
        <Link className="btn small sec" href={`/staff?date=${addDays(date, 1)}`} aria-label="Next day">›</Link>
        {!isToday && <Link className="link-btn" href="/staff">Back to today</Link>}
      </div>

      {sp.welcome && <p className="note ok" role="status" style={{ marginBottom: 12 }}>Welcome! Your account has staff access because your email is on the staff list.</p>}
      {sp.msg && <p className="note ok" role="status" style={{ marginBottom: 12 }}>{sp.msg}</p>}
      {sp.error && <p className="note error" role="alert" style={{ marginBottom: 12 }}>{sp.error}</p>}

      <div className="kpis">
        <div className="kpi"><small>Bookings</small><b>{stats.total}</b></div>
        <div className="kpi"><small>Checked in</small><b>{stats.checkedIn}</b></div>
        <div className="kpi"><small>No-shows</small><b className={stats.noShows ? "alert" : ""}>{stats.noShows}</b></div>
        <div className="kpi" title="North Star: share of bookings made in the app"><small>Booked in app</small><b>{stats.total ? Math.round((stats.fromApp / stats.total) * 100) : 0}%</b></div>
        <div className="kpi"><small>Peak busy</small><b>{peak}%</b></div>
      </div>

      <div className="desk-grid">
        <div>
          <section className="panel">
            <div className="row" style={{ marginBottom: 10 }}>
              <h2 style={{ marginBottom: 0 }}>Bookings, app and phone</h2>
              <span className="spacer" />
              {stats.unaccounted > 0 && isToday && <span className="pill amber">{stats.unaccounted} started, not checked in</span>}
              <Link className="link-btn" href={`/staff?date=${date}${showCancelled ? "" : "&show=all"}`}>{showCancelled ? "Hide cancelled" : "Show cancelled"}</Link>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Time</th><th>Member</th><th>Field / area</th><th>Party</th><th>Source</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr>
                </thead>
                <tbody>
                  {visible.length === 0 && <tr><td colSpan={7} className="empty">No bookings on this day.</td></tr>}
                  {visible.map((b) => {
                    const started = isPastDay || (isToday && b.start_time <= now.time);
                    return (
                      <tr key={b.id} style={b.status === "cancelled" ? { opacity: 0.55 } : undefined}>
                        <td>{prettyTime(b.start_time)}</td>
                        <td>{b.member_name}<br /><span className="muted">#{b.member_no}</span></td>
                        <td>{b.station_name}{Number(b.shared) ? <><br /><span className="muted">shared</span></> : null}</td>
                        <td>{b.party_size}</td>
                        <td>{b.source === "app" ? "App" : "Phone"}</td>
                        <td><StatusTag b={b} started={started} /></td>
                        <td>
                          <div className="actions">
                            {isToday && b.status === "booked" && <Act action={attendanceAction} id={b.id} date={date} to="checked_in" label="Check in" cls="" />}
                            {isToday && b.status === "booked" && started && <Act action={attendanceAction} id={b.id} date={date} to="no_show" label="No-show" cls="danger" />}
                            {isToday && (b.status === "checked_in" || b.status === "no_show") && <Act action={attendanceAction} id={b.id} date={date} to="booked" label="Undo" />}
                            {b.status === "booked" && !started && <Act action={staffCancelAction} id={b.id} date={date} label="Cancel" cls="danger" />}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {walkaround[0] && (
            <section className="panel" aria-labelledby="course-h">
              <h2 id="course-h">{walkaround[0].label}: walk-around check-ins</h2>
              <p className="muted" style={{ marginBottom: 8 }}>
                No bookings here. Check people in as they arrive so members can see how busy the course is.
                {" "}{onCourse.reduce((n, v) => n + Number(v.party_size), 0)} people checked in, {expected.reduce((n, v) => n + Number(v.party_size), 0)} planning to come.
              </p>
              {isToday && (
                <form action={walkInAction} className="row" style={{ alignItems: "flex-end", marginBottom: 10 }}>
                  <input type="hidden" name="activity" value={walkaround[0].key} />
                  <label className="field" style={{ width: 120, marginTop: 0 }}>
                    <span>Group size</span>
                    <input name="party" type="number" min={1} max={50} defaultValue={2} className="input" />
                  </label>
                  <SubmitButton className="btn small" pending="Checking in…">Check in walk-in group</SubmitButton>
                </form>
              )}
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Time</th><th>Who</th><th>People</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
                  <tbody>
                    {visits.length === 0 && <tr><td colSpan={5} className="empty">No planned visits or check-ins.</td></tr>}
                    {visits.map((v) => (
                      <tr key={v.id}>
                        <td>{prettyTime(v.time)}</td>
                        <td>{v.member_name ?? "Walk-in group"}{v.member_no && <><br /><span className="muted">#{v.member_no}</span></>}</td>
                        <td>{v.party_size}</td>
                        <td>{v.kind === "checked_in" ? <span className="pill green">Checked in</span> : <span className="pill">Planning to come</span>}</td>
                        <td>
                          {isToday && (
                            <form action={visitCheckInAction}>
                              <input type="hidden" name="id" value={v.id} />
                              {v.kind === "checked_in" ? (
                                <SubmitButton className="btn small sec" name="undo" value="1" pending="…">Undo</SubmitButton>
                              ) : (
                                <SubmitButton className="btn small" pending="…">Check in</SubmitButton>
                              )}
                            </form>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>

        <aside>
          <section className="panel">
            <h2>+ New phone booking</h2>
            <p className="muted" style={{ marginBottom: 6 }}>Same rules as the app, so double-bookings can&apos;t happen.</p>
            {isPastDay || !times.length ? (
              <p className="muted">{isPastDay ? "Pick today or a later day to add a booking." : "No more times left on this day."}</p>
            ) : (
              <form action={phoneBookingAction}>
                <input type="hidden" name="date" value={date} />
                <label className="field"><span>Member</span>
                  <select name="member" className="input" required defaultValue="">
                    <option value="" disabled>Choose a member…</option>
                    {memberList.map((m) => <option key={m.id} value={m.id}>{m.name} (#{m.member_no})</option>)}
                  </select>
                </label>
                <label className="field"><span>Field or area</span>
                  <select name="station" className="input">
                    {stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
                <div className="row" style={{ alignItems: "flex-end" }}>
                  <label className="field" style={{ flex: 1 }}><span>Time</span>
                    <select name="time" className="input">
                      {times.map((t) => <option key={t} value={t}>{prettyTime(t)}</option>)}
                    </select>
                  </label>
                  <label className="field" style={{ width: 90 }}><span>Party</span>
                    <input name="party" type="number" min={1} max={5} defaultValue={1} className="input" />
                  </label>
                </div>
                <SubmitButton pending="Adding…">Add booking for {prettyDate(date)}</SubmitButton>
              </form>
            )}
          </section>

          <Link href={`/staff/lessons?date=${date}`} className="panel" style={{ display: "block" }}>
            <h2>Lessons · {prettyDate(date)}</h2>
            <p className="muted">{lessons.length ? `${lessons.length} booked ›` : "None booked ›"}</p>
          </Link>

          <Link href="/staff/reservations" className="panel" style={{ display: "block" }}>
            <h2>Pro shop reservations</h2>
            <p className="muted">{pending.length ? `${pending.length} waiting for you to confirm or decline ›` : "Nothing waiting. Nice."}</p>
          </Link>

          <Link href="/staff/requests" className="panel" style={{ display: "block" }}>
            <h2>Member requests</h2>
            <p className="muted">{requests.open ? `${requests.open} open${requests.in_progress ? `, ${requests.in_progress} in progress` : ""} ›` : requests.in_progress ? `${requests.in_progress} in progress ›` : "Nothing waiting. Nice."}</p>
          </Link>

          <section className="panel">
            <h2>How busy · {prettyDate(date)}</h2>
            <BusyMeter hours={club} now={now} date={date} title="Whole club" basis="All areas" id="desk-busy" />
            <AreaBusyList areas={areas} now={now} date={date} links={false} />
          </section>

          {demoMode() && (
            <section className="panel">
              <h2>Demo</h2>
              <p className="muted">Wipes everything (including sign-ups) and puts back the synthetic members, bookings and events, dated around today.</p>
              <form action={resetDemoAction}>
                <SubmitButton className="btn sec" pending="Resetting…">Reset demo data</SubmitButton>
              </form>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
