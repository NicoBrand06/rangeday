import Link from "next/link";
import { weekday } from "@/lib/time";

export default function DayPicker({ dates, current, today, href }: { dates: string[]; current: string; today: string; href: (d: string) => string }) {
  return (
    <nav className="days" aria-label="Day">
      {dates.map((d) => (
        <Link key={d} href={href(d)} className={d === current ? "on" : ""} aria-current={d === current ? "date" : undefined}>
          {d === today ? "Today" : weekday(d)}
          <b>{Number(d.slice(8))}</b>
        </Link>
      ))}
    </nav>
  );
}
