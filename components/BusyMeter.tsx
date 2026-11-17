import type { HourBusy } from "@/lib/busy";
import { busySummary, fmtHour, LEVEL_LABEL } from "@/lib/busy";
import type { ClubNow } from "@/lib/time";

/** Bar chart of how busy an area (or the whole club) is each hour. */
export default function BusyMeter({
  hours,
  now,
  date = now.date,
  title,
  basis = "Based on bookings",
  id = "busy",
}: {
  hours: HourBusy[];
  now: ClubNow;
  date?: string;
  title?: string;
  basis?: string;
  id?: string;
}) {
  if (!hours.length) {
    return (
      <section className="card">
        <h3>{title ? `${title}: closed` : "Closed"}</h3>
        <p>The club is closed this day.</p>
      </section>
    );
  }
  const { headline, tip } = busySummary(hours, now, date);
  // Fade past hours and mark "now" only when showing today.
  const h = date === now.date ? Number(now.time.slice(0, 2)) : date < now.date ? 99 : -1;
  return (
    <section className="card" aria-labelledby={`${id}-h`}>
      <div className="card-row">
        <h3 id={`${id}-h`} className="grow">{title ? `${title} · ` : ""}{headline}</h3>
      </div>
      {tip && <p>{tip}</p>}
      <ul className="meter" aria-label={`How busy ${title ?? "the club"} is each hour`}>
        {hours.map((x) => (
          <li key={x.hour} className={`col ${x.hour < h ? "past" : ""} ${x.hour === h ? "now" : ""}`} style={{ listStyle: "none" }}>
            <span className="sr-only">{fmtHour(x.hour)}: {LEVEL_LABEL[x.level]} ({x.pct}%){x.hour === h ? ", now" : ""}.</span>
            <div className={`barv ${x.level}`} style={{ height: `${Math.max(3, x.pct)}%` }} aria-hidden />
          </li>
        ))}
      </ul>
      <div className="meter-axis" aria-hidden>
        {hours.map((x) => (
          <span key={x.hour} style={x.hour === h ? { fontWeight: 700, color: "var(--navy)" } : undefined}>
            {x.hour > 12 ? x.hour - 12 : x.hour}
          </span>
        ))}
      </div>
      <div className="legend" aria-hidden>
        <span><i style={{ background: "#9db8a0", border: 0 }} />Quiet</span>
        <span><i style={{ background: "var(--green)", border: 0 }} />Moderate</span>
        <span><i style={{ background: "var(--navy)", border: 0 }} />Busy</span>
        <span className="spacer" />
        <span>{basis}</span>
      </div>
    </section>
  );
}
