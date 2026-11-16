import type { HourBusy } from "@/lib/busy";
import { busySummary, fmtHour } from "@/lib/busy";
import type { ClubNow } from "@/lib/time";

const WORD = { quiet: "quiet", moderate: "moderate", busy: "busy" };

/** Bar chart of how full the club is each hour today. */
export default function BusyMeter({ hours, now, date = now.date }: { hours: HourBusy[]; now: ClubNow; date?: string }) {
  const { headline, tip } = busySummary(hours, now, date);
  // Fade past hours and mark "now" only when showing today.
  const h = date === now.date ? Number(now.time.slice(0, 2)) : date < now.date ? 99 : -1;
  return (
    <section className="card" aria-labelledby="busy-h">
      <div className="card-row">
        <h3 id="busy-h" className="grow">{headline}</h3>
      </div>
      {tip && <p>{tip}</p>}
      <ul className="meter" aria-label="Share of stations booked each hour">
        {hours.map((x) => (
          <li key={x.hour} className={`col ${x.hour < h ? "past" : ""} ${x.hour === h ? "now" : ""}`} style={{ listStyle: "none" }}>
            <span className="sr-only">{fmtHour(x.hour)}: {x.pct}% booked, {WORD[x.level]}{x.hour === h ? " (now)" : ""}.</span>
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
        <span>Based on bookings</span>
      </div>
    </section>
  );
}
