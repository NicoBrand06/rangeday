import Link from "next/link";
import EventForm from "@/components/EventForm";
import { addDays, clubNow } from "@/lib/time";

export default async function NewEvent({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const now = clubNow();
  return (
    <section className="panel" style={{ maxWidth: 640 }}>
      <Link href="/staff/events" className="link-btn">‹ All events</Link>
      <h2 style={{ marginTop: 6 }}>New event</h2>
      {sp.error && <p className="note error" role="alert">{sp.error}</p>}
      <EventForm e={{ ...sp, capacity: sp.capacity ? Number(sp.capacity) : undefined, date: sp.date ?? addDays(now.date, 7) }} minDate={now.date} />
    </section>
  );
}
