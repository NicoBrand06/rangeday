import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getCtx } from "@/lib/context";
import { bookableDates } from "@/lib/booking";
import { busyByArea, clubWide } from "@/lib/busy";
import { MODE_LABEL } from "@/lib/config";
import BusyMeter from "@/components/BusyMeter";
import DayPicker from "@/components/DayPicker";

const BASIS = { slot: "Fields booked", shared: "People booked", walkaround: "Check-ins + planned visits" } as const;

export default async function BusyPage({ searchParams }: { searchParams: Promise<{ area?: string; date?: string }> }) {
  const sp = await searchParams;
  await requireUser();
  const { db, cfg, now } = await getCtx();
  const dates = bookableDates(cfg, now);
  const date = sp.date && dates.includes(sp.date) ? sp.date : dates[0];
  const areas = await busyByArea(db, cfg, date, now);
  const area = areas.find((a) => a.activity === sp.area);
  const q = (p: { area?: string; date?: string }) => `/busy?${new URLSearchParams({ ...(area ? { area: area.activity } : {}), date, ...p })}`;

  return (
    <>
      <div className="bar">
        <Link href="/" className="back">‹ Home</Link>
        <h1>How busy: {area?.label ?? "Whole club"}</h1>
        <p>{area ? MODE_LABEL[area.mode] : "All areas"} · hour by hour</p>
      </div>
      <div className="pad">
        <nav className="chips" aria-label="Area">
          <Link href={`/busy?date=${date}`} className={`chip ${!area ? "on" : ""}`}>Whole club</Link>
          {areas.map((a) => (
            <Link key={a.activity} href={q({ area: a.activity })} className={`chip ${a.activity === area?.activity ? "on" : ""}`}>{a.label}</Link>
          ))}
        </nav>
        <DayPicker dates={dates} current={date} today={now.date} href={(d) => q({ date: d })} />
        <BusyMeter hours={area ? area.hours : clubWide(areas)} now={now} date={date} basis={area ? BASIS[area.mode] : "Bookings + check-ins"} />
        <p className="note">
          Quiet is under about a third full, Busy is 70% or more.{" "}
          {area?.mode === "walkaround" && "The course never gets full: each check-in counts for about one round, and planned visits count for times still ahead."}
          {area?.mode === "shared" && `Up to ${cfg.activities.find((a) => a.key === area.activity)?.perSlot} people can book each time.`}
        </p>
        {area && (
          <Link href={`/book?activity=${area.activity}&date=${date}`} className="btn">
            {area.mode === "walkaround" ? "Plan a visit" : `Book ${area.label}`}
          </Link>
        )}
      </div>
    </>
  );
}
