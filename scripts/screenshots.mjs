// Takes the README screenshots. Needs the app running in demo mode (npm run dev) and Google Chrome installed.
// Usage: npm run screenshots
// Note: it resets the demo data first and last, and makes a few bookings as Sam in between.
import { chromium } from "playwright-core";
import { mkdirSync, rmSync } from "node:fs";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const out = "docs/screenshots";
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: "chrome" });
// caret: "initial" stops Playwright injecting a style (which trips a dev-only React warning);
// the injected CSS hides Next.js's dev-only overlay badge.
const shot = (page, name, opts = {}) =>
  page.screenshot({ path: `${out}/${name}.png`, caret: "initial", style: "nextjs-portal{display:none!important}", ...opts });
const settle = (page) => page.waitForLoadState("networkidle");

async function deskLogin() {
  const desk = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1.5 });
  await desk.goto(`${base}/login`);
  await desk.click("button[value=staff]");
  await desk.waitForURL(`${base}/staff`);
  return desk;
}
async function resetDemo() {
  const desk = await deskLogin();
  await desk.click("text=Reset demo data");
  await desk.waitForURL(/login/);
  await desk.close();
}

await resetDemo();
const desk = await deskLogin();
const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

// Member screens
await phone.goto(`${base}/login`);
await shot(phone, "01-login");
await phone.click("button[value=member]");
await phone.waitForURL(`${base}/`);
await phone.evaluate(() => document.querySelector(".lbl:nth-of-type(2)")?.scrollIntoView());
await phone.evaluate(() => window.scrollBy(0, -10));
await shot(phone, "02-home-busy");

// Slot-booked: pick a field and time
await phone.goto(`${base}/book?activity=trap`);
await phone.locator(".days a").nth(2).click();
await settle(phone);
const few = phone.locator("a.slot.few").first();
await ((await few.count()) ? few : phone.locator("a.slot.open").first()).click();
await phone.waitForSelector("#confirm");
await phone.click("button[aria-label='One more shooter']");
await phone.evaluate(() => {
  const btn = document.querySelector("#confirm button.btn");
  window.scrollTo(0, btn.getBoundingClientRect().bottom + window.scrollY - window.innerHeight + 76);
});
await shot(phone, "03-book-slot");
await phone.click("#confirm button.btn");
await phone.waitForURL(/new=1/);

// Shared area: "x of 5 booked"
await phone.goto(`${base}/book?activity=pond`);
await phone.locator(".days a").nth(4).click();
await settle(phone);
await phone.locator("a.slot.few, a.slot.open").filter({ hasNotText: "0 of" }).first().click();
await phone.waitForSelector("#confirm");
await phone.evaluate(() => document.querySelector("#confirm")?.scrollIntoView());
await phone.evaluate(() => window.scrollBy(0, -170));
await shot(phone, "04-book-shared");

// Walk-around: busy forecast, no booking
await phone.goto(`${base}/book?activity=clays`);
await phone.locator(".days a").nth(5).click();
await settle(phone);
await shot(phone, "05-walkaround");

// Lessons
await phone.goto(`${base}/book/lesson?discipline=clays`);
for (let d = 0; d < 7; d++) {
  const link = phone.locator(".days a").nth(d);
  const date = new URL(await link.getAttribute("href"), base).searchParams.get("date");
  await link.click();
  await phone.waitForURL((u) => u.href.includes(date));
  await settle(phone);
  if ((await phone.locator("section.card a.slot").count()) >= 2) break;
}
await phone.locator("section.card a.slot").nth(1).click();
await phone.waitForSelector("#confirm");
await phone.evaluate(() => document.querySelector("#confirm")?.scrollIntoView({ block: "end" }));
await phone.evaluate(() => window.scrollBy(0, 80));
await shot(phone, "06-lesson");

// Events with a waitlist
await phone.goto(`${base}/events`);
await shot(phone, "07-events");
await phone.locator("a.item", { hasText: "waitlist open" }).first().click();
await phone.waitForURL(/events\/\d+/);
await phone.click("text=Join the waitlist");
await phone.waitForURL(/waitlisted=1/);
await shot(phone, "08-waitlist");

// Pro shop
await phone.goto(`${base}/shop/4`);
await phone.click("button[aria-label='One more item']");
await phone.click("form button.btn");
await phone.waitForURL(/reserved=1/);
await shot(phone, "09-reserved");

// Let the shop know
await phone.goto(`${base}/requests`);
await shot(phone, "16-let-the-shop-know");

// Staff screens
await desk.goto(`${base}/staff`);
await shot(desk, "10-staff-today", { fullPage: true });
await desk.goto(`${base}/staff/lessons?view=week`);
await shot(desk, "11-staff-lessons");
await desk.goto(`${base}/staff/instructors/1`);
await shot(desk, "12-staff-instructor");
await desk.goto(`${base}/staff/events`);
await desk.locator("tr", { hasText: "Full" }).first().locator("text=Manage").click();
await desk.waitForURL(/events\/\d+/);
await shot(desk, "13-staff-event-waitlist");
await desk.goto(`${base}/staff/settings?tab=areas`);
await shot(desk, "14-staff-settings-areas");
await desk.goto(`${base}/staff/reservations`);
await shot(desk, "15-staff-reservations");
await desk.goto(`${base}/staff/requests?status=all`);
await shot(desk, "17-staff-requests");

// Put the demo back the way it was
await resetDemo();
await browser.close();
console.log(`Saved screenshots to ${out}/`);
