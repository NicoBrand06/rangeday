import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { getCtx } from "@/lib/context";
import EventForm from "@/components/EventForm";
import { addDays } from "@/lib/time";

export default async function NewEvent({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  await requireStaff();
  const { now } = await getCtx();
  return (
    <section className="panel" style={{ maxWidth: 640 }}>
      <Link href="/staff/events" className="link-btn">‹ All events</Link>
      <h2 style={{ marginTop: 6 }}>New event</h2>
      {sp.error && <p className="note error" role="alert">{sp.error}</p>}
      <EventForm e={{ ...sp, capacity: sp.capacity ? Number(sp.capacity) : undefined, date: sp.date ?? addDays(now.date, 7) }} minDate={now.date} repeat={sp.repeat} />
    </section>
  );
}
