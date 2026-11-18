"use server";
import { requireStaff } from "@/lib/auth";
import { back } from "@/lib/back";
import { getCtx } from "@/lib/context";
import { demoMode } from "@/lib/db";
import { futureBookingsOn, logoFromFile, saveActivity, saveBranding, saveHours, savePolicies, saveStation } from "@/lib/admin";
import { saveItem, setItemActive } from "@/lib/shop";

const s = (f: FormData, k: string) => String(f.get(k) ?? "");
const go: (tab: string, p: Record<string, string>) => never = (tab, p) => back("/staff/settings", { tab, ...p });

export async function brandingAction(formData: FormData) {
  await requireStaff();
  if (demoMode()) go("club", { error: "Branding is locked on the public demo so visitors can't change it." });
  const logo = await logoFromFile(formData.get("logo") as File | null);
  if (!logo.ok) go("club", { error: logo.error });
  const r = await saveBranding((await getCtx()).db, {
    clubName: s(formData, "clubName"),
    tagline: s(formData, "tagline"),
    shopPhone: s(formData, "shopPhone"),
    primary: s(formData, "primary"),
    accent: s(formData, "accent"),
    logo: logo.logo,
    removeLogo: formData.get("removeLogo") === "1",
  });
  go("club", r.ok ? (r.warnings.length ? { warn: r.warnings.join(" ") } : { msg: "Saved. The app now uses these colours." }) : { error: r.error });
}

export async function hoursAction(formData: FormData) {
  await requireStaff();
  const hours = Array.from({ length: 7 }, (_, d) => ({
    weekday: d,
    open: s(formData, `open-${d}`),
    close: s(formData, `close-${d}`),
    closed: formData.get(`closed-${d}`) === "1",
  }));
  const r = await saveHours((await getCtx()).db, hours);
  go("hours", r.ok ? { msg: "Opening hours saved. Booking times follow them straight away." } : { error: r.error });
}

export async function policiesAction(formData: FormData) {
  await requireStaff();
  const n = (k: string) => Number(formData.get(k));
  const r = await savePolicies((await getCtx()).db, {
    bookingDays: n("bookingDays"),
    maxPerDay: n("maxPerDay"),
    cancelCutoff: s(formData, "cancelCutoff"),
    reservationExpiryDays: n("reservationExpiryDays"),
    roundMinutes: n("roundMinutes"),
    lessonMinutes: n("lessonMinutes"),
    timezone: s(formData, "timezone"),
  });
  go("policies", r.ok ? { msg: "Policies saved." } : { error: r.error });
}

export async function activityAction(formData: FormData) {
  await requireStaff();
  const per = s(formData, "perSlot");
  const r = await saveActivity((await getCtx()).db, {
    key: s(formData, "key") || undefined,
    label: s(formData, "label"),
    mode: s(formData, "mode"),
    perSlot: per ? Number(per) : null,
    active: formData.get("active") !== "0",
  });
  go("areas", r.ok ? { msg: "Area saved." } : { error: r.error });
}

export async function stationAction(formData: FormData) {
  await requireStaff();
  const { db, now } = await getCtx();
  const id = Number(formData.get("id")) || undefined;
  const active = formData.get("active") !== "0";
  const r = await saveStation(db, { id, activity: s(formData, "activity"), name: s(formData, "name"), capacity: Number(formData.get("capacity")), active });
  if (!r.ok) go("areas", { error: r.error });
  if (id && !active) {
    const n = await futureBookingsOn(db, id, now.date);
    if (n) go("areas", { warn: `Field retired. It still has ${n} upcoming booking${n === 1 ? "" : "s"}, which stay in place. Check the Today page if you need to move them.` });
  }
  go("areas", { msg: id ? "Field saved." : "Field added." });
}

export async function itemAction(formData: FormData) {
  await requireStaff();
  const id = Number(formData.get("id")) || null;
  const r = await saveItem((await getCtx()).db, id, { name: s(formData, "name"), category: s(formData, "category"), detail: s(formData, "detail"), price: s(formData, "price") });
  go("shop", r.ok ? { msg: id ? "Item saved." : "Item added to the pro shop." } : { error: r.error });
}

export async function itemActiveAction(formData: FormData) {
  await requireStaff();
  const active = formData.get("active") === "1";
  await setItemActive((await getCtx()).db, Number(formData.get("id")), active);
  go("shop", { msg: active ? "Item is visible again." : "Item hidden from members. Past reservations keep their history." });
}
