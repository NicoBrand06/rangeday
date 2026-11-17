import Link from "next/link";
import { areaNow, fmtHour, LEVEL_LABEL, type AreaBusy } from "@/lib/busy";
import { MODE_LABEL } from "@/lib/config";
import type { ClubNow } from "@/lib/time";

/** One row per area: how busy it is right now and when it peaks. Tap for the hourly bars. */
export default function AreaBusyList({ areas, now, date = now.date, links = true }: { areas: AreaBusy[]; now: ClubNow; date?: string; links?: boolean }) {
  if (!areas.length) return <p className="card muted">The club is closed today.</p>;
  return (
    <ul className="card" style={{ listStyle: "none", padding: "4px 14px" }} aria-label="How busy each area is">
      {areas.map((a) => {
        const { current, peak } = areaNow(a.hours, now, date);
        const level = current?.level ?? peak?.level ?? "quiet";
        // Today, outside opening hours: say so rather than showing the day's peak.
        const lastHour = a.hours[a.hours.length - 1]?.hour ?? 0;
        const closedNow = date === now.date && !current && Number(now.time.slice(0, 2)) > lastHour;
        const pill = closedNow ? "Closed now" : current ? `Now: ${LEVEL_LABEL[current.level]}` : `${date === now.date ? "Today" : "Peak"}: ${LEVEL_LABEL[level]}`;
        const Row = links ? Link : "div";
        return (
          <li key={a.activity}>
            <Row href={`/busy?area=${a.activity}&date=${date}`} className="item" style={{ padding: "10px 0" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h4>{a.label}</h4>
                <p>
                  {MODE_LABEL[a.mode]}
                  {peak && peak.pct > 0 ? ` · busiest ${fmtHour(peak.hour)}` : ""}
                </p>
              </div>
              <span className={`pill ${closedNow ? "" : `level-${level}`}`}>{pill}</span>
            </Row>
          </li>
        );
      })}
    </ul>
  );
}
