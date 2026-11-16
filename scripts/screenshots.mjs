// Takes the README screenshots. Needs the app running (npm run dev) and Google Chrome installed.
// Usage: npm run screenshots
// Note: it makes a booking and a reservation as Sam, then resets the demo data at the end.
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const out = "docs/screenshots";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: "chrome" });
const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
// caret: "initial" stops Playwright injecting a style (which trips a dev-only React warning);
// the injected CSS hides Next.js's dev-only overlay badge.
const shot = (page, name, opts = {}) =>
  page.screenshot({ path: `${out}/${name}.png`, caret: "initial", style: "nextjs-portal{display:none!important}", ...opts });

// Start from fresh demo data
const desk = await browser.newPage({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1.5 });
await desk.goto(`${base}/login`);
await desk.click("button[value=staff]");
await desk.waitForURL(`${base}/staff`);
await desk.click("text=Reset demo data");
await desk.waitForURL(/msg=/);

// Member screens
await phone.goto(`${base}/login`);
await shot(phone, "01-login");
await phone.click("button[value=member]");
await phone.waitForURL(`${base}/`);
await shot(phone, "02-home");

await phone.goto(`${base}/book?activity=clays`);
await phone.locator(".days a").nth(3).click();
await phone.waitForLoadState("networkidle");
const slot = phone.locator("a.slot.few").first();
await ((await slot.count()) ? slot : phone.locator("a.slot.open").first()).click();
await phone.waitForSelector("#confirm");
await phone.click("button[aria-label='One more shooter']");
// Scroll so the Confirm button sits just above the tab bar
await phone.evaluate(() => {
  const btn = document.querySelector("#confirm button.btn");
  window.scrollTo(0, btn.getBoundingClientRect().bottom + window.scrollY - window.innerHeight + 76);
});
await shot(phone, "03-book");
await phone.click("#confirm button.btn");
await phone.waitForURL(/new=1/);
await shot(phone, "04-booked");

await phone.goto(`${base}/events`);
await shot(phone, "05-events");
await phone.goto(`${base}/events/4`);
await shot(phone, "06-event");

await phone.goto(`${base}/shop?cat=Ammunition`);
await shot(phone, "07-shop");
await phone.goto(`${base}/shop/4`);
await phone.click("button[aria-label='One more item']");
await phone.click("button.btn");
await phone.waitForURL(/reserved=1/);
await shot(phone, "08-reserved");
await phone.goto(`${base}/account`);
await phone.locator("#reservations").scrollIntoViewIfNeeded();
await phone.evaluate(() => window.scrollBy(0, -80));
await shot(phone, "09-account");

// Staff screens
await desk.goto(`${base}/staff`);
await shot(desk, "10-staff-today");
await desk.goto(`${base}/staff/reservations`);
await shot(desk, "11-staff-reservations");
await desk.goto(`${base}/staff/events/2`);
await shot(desk, "12-staff-event");

// Put the demo back the way it was
await desk.goto(`${base}/staff`);
await desk.click("text=Reset demo data");
await desk.waitForURL(/msg=/);

await browser.close();
console.log(`Saved screenshots to ${out}/`);
