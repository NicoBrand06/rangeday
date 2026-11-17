import Link from "next/link";
import type { EventRow } from "@/lib/events";
import { spotsLeft } from "@/lib/events";
import { prettyTime, weekday } from "@/lib/time";

export function EventStatus({ e }: { e: EventRow }) {
  if (e.cancelled) return <span className="pill red">Cancelled</span>;
  if (e.mine === "going") return <span className="pill green">You&apos;re going</span>;
  if (e.mine === "waitlist") return <span className="pill amber">Waitlist #{e.my_position}</span>;
  const left = spotsLeft(e);
  if (left === 0) return <span className="pill">Full · waitlist open</span>;
  if (left <= 3) return <span className="pill amber">{left} {left === 1 ? "spot" : "spots"} left</span>;
  return null;
}

export default function EventCard({ e }: { e: EventRow }) {
  const month = new Date(`${e.date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  return (
    <Link href={`/events/${e.id}`} className="item">
      <div className="thumb" style={{ flexDirection: "column", lineHeight: 1.05 }} aria-hidden>
        <small style={{ fontSize: "0.65rem", textTransform: "uppercase" }}>{month}</small>
        <b style={{ fontSize: "1.15rem" }}>{Number(e.date.slice(8))}</b>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h4>{e.title}</h4>
        <p>{weekday(e.date)} {prettyTime(e.start_time)} · {e.category} · {e.location}{e.series_id ? " · repeats" : ""}</p>
      </div>
      <EventStatus e={e} />
    </Link>
  );
}
