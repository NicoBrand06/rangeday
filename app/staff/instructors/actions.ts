"use server";
import { requireStaff } from "@/lib/auth";
import { back } from "@/lib/back";
import { getCtx } from "@/lib/context";
import { blockDay, bookLesson, cancelLesson, saveInstructor, setInstructorActive, setWeeklyHours, unblockDay, type HoursWindow } from "@/lib/lessons";
import { notify } from "@/lib/notify";
import { prettyTime } from "@/lib/time";

const s = (f: FormData, k: string) => String(f.get(k) ?? "");

export async function saveInstructorAction(formData: FormData) {
  await requireStaff();
  const { db, cfg } = await getCtx();
  const id = Number(formData.get("id")) || undefined;
  const r = await saveInstructor(db, cfg, { id, name: s(formData, "name"), specialty: s(formData, "specialty"), disciplines: formData.getAll("disciplines").map(String) });
  if (!r.ok) back(id ? `/staff/instructors/${id}` : "/staff/instructors", { error: r.error });
  back(`/staff/instructors/${r.id}`, { msg: id ? "Saved." : "Instructor added. Now set their weekly availability below." });
}

export async function toggleInstructorAction(formData: FormData) {
  await requireStaff();
  const id = Number(formData.get("id"));
  const active = formData.get("active") === "1";
  await setInstructorActive((await getCtx()).db, id, active);
  back(`/staff/instructors/${id}`, { msg: active ? "Taking lessons again." : "Deactivated. Members can't book them; booked lessons stay." });
}

export async function weeklyHoursAction(formData: FormData) {
  await requireStaff();
  const id = Number(formData.get("id"));
  const windows: HoursWindow[] = [];
  for (let d = 0; d < 7; d++) {
    for (const w of [0, 1]) {
      const start = s(formData, `start-${d}-${w}`);
      const end = s(formData, `end-${d}-${w}`);
      if (start || end) windows.push({ weekday: d, start_time: start, end_time: end });
    }
  }
  const r = await setWeeklyHours((await getCtx()).db, id, windows);
  back(`/staff/instructors/${id}`, r.ok ? { msg: "Weekly availability saved." } : { error: r.error });
}

export async function blockDayAction(formData: FormData) {
  await requireStaff();
  const { db, now } = await getCtx();
  const id = Number(formData.get("id"));
  const r = await blockDay(db, id, s(formData, "date"), s(formData, "reason"), now);
  if (!r.ok) back(`/staff/instructors/${id}`, { error: r.error });
  const warn = r.affected.length
    ? `Day blocked, but ${r.affected.length} lesson${r.affected.length === 1 ? " is" : "s are"} already booked: ${r.affected.map((l) => `${l.member_name} (#${l.member_no}) at ${prettyTime(l.start_time)}`).join(", ")}. Contact them, then cancel or move the lesson from the Lessons page.`
    : "";
  back(`/staff/instructors/${id}`, warn ? { warn } : { msg: "Day blocked. Members can't book them that day." });
}

export async function unblockDayAction(formData: FormData) {
  await requireStaff();
  const id = Number(formData.get("id"));
  await unblockDay((await getCtx()).db, id, s(formData, "date"));
  back(`/staff/instructors/${id}`, { msg: "Day off removed." });
}

export async function staffBookLessonAction(formData: FormData) {
  await requireStaff();
  const { db, cfg, now } = await getCtx();
  const date = s(formData, "date");
  const userId = Number(formData.get("member"));
  const r = await bookLesson(
    db,
    cfg,
    { instructorId: Number(formData.get("instructor")), userId, discipline: s(formData, "discipline"), date, time: s(formData, "time"), source: "phone" },
    now,
  );
  if (r.ok) await notify({ kind: "lesson", userId, lessonId: r.id });
  back("/staff/lessons", r.ok ? { date, msg: "Lesson booked." } : { date, error: r.error });
}

export async function staffCancelLessonAction(formData: FormData) {
  const staff = await requireStaff();
  const { db, cfg, now } = await getCtx();
  const r = await cancelLesson(db, cfg, Number(formData.get("id")), staff, now);
  back("/staff/lessons", r.ok ? { date: s(formData, "date"), msg: "Lesson cancelled." } : { date: s(formData, "date"), error: r.error });
}
