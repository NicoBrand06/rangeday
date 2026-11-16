import Link from "next/link";
import { getDb } from "@/lib/db";
import { SLOTS } from "@/lib/club";
import { busyByHour } from "@/lib/busy";
import { bookingsOn, dayStats, members, type DeskBooking } from "@/lib/staff";
import { openReservations } from "@/lib/shop";
import { addDays, clubNow, prettyDate, prettyTime } from "@/lib/time";
import BusyMeter from "@/components/BusyMeter";
import { attendanceAction, phoneBookingAction, resetDemoAction, staffCancelAction } from "./actions";

type Search = { date?: string; msg?: string; error?: string; show?: string };

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
      <button className={`btn small ${cls}`}>{label}</button>
    </form>
  );
}

export default async function StaffToday({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const now = clubNow();
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : now.date;
  const db = await getDb();
  const [rows, hours, memberList, stations, pending] = await Promise.all([
    bookingsOn(db, date),
    busyByHour(db, date),
    members(db),
    db.execute("SELECT id, name, capacity FROM stations ORDER BY id").then((r) => r.rows as unknown as { id: number; name: string; capacity: number }[]),
    openReservations(db).then((r) => r.filter((x) => x.status === "pending")),
  ]);
  const stats = dayStats(rows, now, date);
  const peak = Math.max(...hours.map((h) => h.pct));
  const showCancelled = sp.show === "all";
  const visible = rows.filter((r) => showCancelled || r.status !== "cancelled");
  const isToday = date === now.date;
  const isPastDay = date < now.date;

  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        <Link className="btn small sec" href={`/staff?date=${addDays(date, -1)}`} aria-label="Previous day">‹</Link>
        <h2 style={{ fontSize: "1.2rem", color: "var(--navy)" }}>{isToday ? "Today · " : ""}{prettyDate(date)}</h2>
        <Link className="btn small sec" href={`/staff?date=${addDays(date, 1)}`} aria-label="Next day">›</Link>
        {!isToday && <Link className="link-btn" href="/staff">Back to today</Link>}
      </div>

      {sp.msg && <p className="note ok" role="status" style={{ marginBottom: 12 }}>{sp.msg}</p>}
      {sp.error && <p className="note error" role="alert" style={{ marginBottom: 12 }}>{sp.error}</p>}

      <div className="kpis">
        <div className="kpi"><small>Bookings</small><b>{stats.total}</b></div>
        <div className="kpi"><small>Checked in</small><b>{stats.checkedIn}</b></div>
        <div className="kpi"><small>No-shows</small><b className={stats.noShows ? "alert" : ""}>{stats.noShows}</b></div>
        <div className="kpi" title="North Star: share of bookings made in the app"><small>Booked in app</small><b>{stats.total ? Math.round((stats.fromApp / stats.total) * 100) : 0}%</b></div>
        <div className="kpi"><small>Peak utilization</small><b>{peak}%</b></div>
      </div>

      <div className="desk-grid">
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
                <tr><th>Time</th><th>Member</th><th>Station</th><th>Party</th><th>Source</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr>
              </thead>
              <tbody>
                {visible.length === 0 && <tr><td colSpan={7} className="empty">No bookings on this day.</td></tr>}
                {visible.map((b) => {
                  const started = isPastDay || (isToday && b.start_time <= now.time);
                  return (
                    <tr key={b.id} style={b.status === "cancelled" ? { opacity: 0.55 } : undefined}>
                      <td>{prettyTime(b.start_time)}</td>
                      <td>{b.member_name}<br /><span className="muted">#{b.member_no}</span></td>
                      <td>{b.station_name}</td>
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

        <aside>
          <section className="panel">
            <h2>+ New phone booking</h2>
            <p className="muted" style={{ marginBottom: 6 }}>Same rules as the app, so the binder goes away and double-bookings can&apos;t happen.</p>
            {isPastDay ? (
              <p className="muted">Pick today or a later day to add a booking.</p>
            ) : (
              <form action={phoneBookingAction}>
                <input type="hidden" name="date" value={date} />
                <label className="field"><span>Member</span>
                  <select name="member" className="input" required defaultValue="">
                    <option value="" disabled>Choose a member…</option>
                    {memberList.map((m) => <option key={m.id} value={m.id}>{m.name} (#{m.member_no})</option>)}
                  </select>
                </label>
                <label className="field"><span>Station</span>
                  <select name="station" className="input">
                    {stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
                <div className="row" style={{ alignItems: "flex-end" }}>
                  <label className="field" style={{ flex: 1 }}><span>Time</span>
                    <select name="time" className="input">
                      {SLOTS.filter((t) => !isToday || t > now.time).map((t) => <option key={t} value={t}>{prettyTime(t)}</option>)}
                    </select>
                  </label>
                  <label className="field" style={{ width: 90 }}><span>Party</span>
                    <input name="party" type="number" min={1} max={5} defaultValue={1} className="input" />
                  </label>
                </div>
                <button className="btn">Add booking for {prettyDate(date)}</button>
              </form>
            )}
          </section>

          <Link href="/staff/reservations" className="panel" style={{ display: "block" }}>
            <h2>Pro shop reservations</h2>
            <p className="muted">{pending.length ? `${pending.length} waiting for you to confirm or decline ›` : "Nothing waiting. Nice."}</p>
          </Link>

          <section className="panel">
            <h2>How busy · {prettyDate(date)}</h2>
            <BusyMeter hours={hours} now={now} date={date} />
          </section>

          <section className="panel">
            <h2>Demo</h2>
            <p className="muted">Puts back the synthetic members, bookings, events and reservations, dated around today.</p>
            <form action={resetDemoAction}>
              <button className="btn sec">Reset demo data</button>
            </form>
          </section>
        </aside>
      </div>
    </>
  );
}
