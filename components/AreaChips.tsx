import Link from "next/link";
import type { Activity } from "@/lib/config";

/** The row of area chips at the top of the Book screen, plus "Lessons". */
export default function AreaChips({ areas, current, date }: { areas: Activity[]; current: string; date?: string }) {
  const q = date ? `&date=${date}` : "";
  return (
    <nav className="chips" aria-label="Area">
      {areas.map((a) => (
        <Link key={a.key} href={`/book?activity=${a.key}${q}`} className={`chip ${a.key === current ? "on" : ""}`} aria-current={a.key === current ? "true" : undefined}>
          {a.label}
        </Link>
      ))}
      <Link href={`/book/lesson${date ? `?date=${date}` : ""}`} className={`chip ${current === "lesson" ? "on" : ""}`} aria-current={current === "lesson" ? "true" : undefined}>
        Lessons
      </Link>
    </nav>
  );
}
