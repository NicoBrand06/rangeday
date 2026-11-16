# RangeDay: product notes

The key decisions behind this MVP, what each one traded away, and what would make me change my mind. Written so I can explain any of them in an interview.

Source material: [the case study](RangeDay_Product_Case_Study.pdf) (discovery, RICE, roadmap, metrics) and [wireframes](wireframes.html). All data is synthetic.

---

## 1. Scope: build the slice that can be shown end to end

**Decision.** The prototype covers booking, events, a busy meter, reserve-for-pickup and the staff desk. The case study's Q1 MVP instead leads with reminders (F05), stock check (F07) and weather alerts (F20).

**Why.** Those three depend on outside systems: an SMS/push provider, the club's inventory feed, and real member contact details. In a prototype they'd be fake, and a faked stock feed demonstrates nothing. Events (Q2 in the case study) and reserve-for-pickup (Q3) *can* be built honestly, and they show the full loop: member asks → staff act → member sees the result.

**Tradeoff.** The prototype doesn't follow the RICE order. If this were the real Q1 build, reminders would come before events, because no-shows carry about 70% of the business case.

**Interview line.** *"The roadmap says what to ship first to the club. The prototype says what I can prove works without integrations. Those are different questions, so I scoped them differently and wrote down why."*

## 2. Reserve for pickup without live stock

**Decision.** A reservation is a *request*. Staff check the real shelf, then confirm or decline with a note. There are no stock badges and no payment.

**Why.**
- Stock questions are 18% of desk calls, and stock was the top research theme (T4).
- The full answer, a live inventory feed, is the riskiest dependency in the plan.
- "Request + human confirm" removes the wasted drive and most of the call, with zero integration.

**Tradeoff.** Members wait for staff, and staff take on a small queue. If staff are slow, trust drops.

**What would change my mind.**
- A high **decline rate** means members are guessing blind. That's the evidence to fund the POS integration first.
- A long **time to decision** means the queue needs an owner or alerts.

The app stores `created_at` and `updated_at` on every reservation, so both are measurable from day one.

**Design detail.** I removed the wireframe's "In stock / Low: 4 left" badges, because showing stock we don't have would be worse than showing none. A note explains this instead.

## 3. POS integration: next, not now

**Plan.**
1. **Read-only.** Pull stock from the club's inventory system at least every 15 minutes. Show *In stock / Low / Out with next delivery date*, never exact counts above 10, as the case study specified. Add a freshness stamp ("Stock updated 12 minutes ago").
2. **Assist.** Pre-check reservations against stock; staff only handle exceptions.
3. **Write-back.** Hold reserved units in the POS and complete the sale at pickup.

**Why staged.** Each step is useful on its own, and each can be stopped if the data is unreliable. Stock data that's wrong is the case study's top trust risk.

## 4. Double-booking is prevented by the database, not just the screen

**Decision.** A unique index on *(station, date, time)* for live bookings, plus checks in the app.

**Why.** Double-bookings are a guardrail metric (6 a month → 0). An app-only check has a race window: two people tapping Confirm at once. The database rule closes it. A test fires two simultaneous bookings and asserts exactly one wins.

**Tradeoff.** None worth mentioning. This is the cheapest reliability win in the project.

## 5. Phone bookings go through the same rules

**Decision.** Staff book on a member's behalf with the same function the app uses, and the booking is tagged `source = phone`.

**Why.**
- It removes the paper binder, the root cause of double-bookings (T3).
- It keeps members who prefer the phone fully served. The desk answer rate is a guardrail.
- It's how the North Star (self-serve share) gets measured: app ÷ all bookings.

## 6. Booking rules

| Rule | Value | Reasoning |
|---|---|---|
| Slot length | 30 min, 8:00 am to 4:30 pm start | Matches the wireframe; roughly one round of trap or skeet |
| Booking window | Today + 13 days | Case study: availability for 14 days |
| Party size | 1 to 5 per station | Typical squad size |
| Per member | Max 2 bookings a day; not two stations at the same time | Stops hoarding of peak Saturday slots; an open policy question in the case study, so it's one line to change |
| Member cancel cut-off | 6 pm the day before | From the case study PRD (F04). After it, the app says "call the desk"; staff can still cancel |
| Scarcity label | "1 left" / "2 left" in amber | Case study: show *low (1–2 left)* before the member commits |

**Open questions I'd take to the club:** Do guests count toward the daily limit? Should attended sessions count toward the limit, or only upcoming ones? Is 6 pm the right cut-off for Sunday-morning bookings?

## 7. Check-in and no-shows are the money metric

**Decision.** One-tap check-in, no-show (only after the slot starts) and undo on the desk. A badge counts "started, not checked in".

**Why.** The case study's business case is $34,384 a year in benefits, and about 70% of that comes from re-filling no-show slots, not from labor savings. Without check-in data, the no-show rate can't be measured, so the main value can't be proven.

**Tradeoff.** It relies on staff tapping consistently. QR self check-in (roadmap) would remove that dependency.

## 8. The busy meter uses the utilization formula

**Decision.** "How busy" = booked station-time ÷ available station-time, per hour. Under 35% is quiet, 35–69% moderate, and 70% or more busy. The same number appears as *Peak utilization* on the desk.

**Why.** One definition, two audiences. Members see crowd levels; operations see the metric (target: 71% → 80% on Saturday mornings).

**Tradeoff.** It's based on bookings, not people actually on site. It counts stations, not party size, so a solo shooter and a squad of five weigh the same. Good enough to steer members to quieter times. It would get sharper with check-in data.

**Also:** it's today-only on the member side. Showing it for any chosen day on the booking screen is a cheap follow-up.

## 9. Events are protected against overfilling

**Decision.** An RSVP is added in a single database step that only succeeds if there's still room. Staff can't lower capacity below current RSVPs. A cancelled event stays visible, marked *Cancelled*, so members who RSVP'd notice.

**Known gap.** Events don't block station bookings. A clinic on Skeet Field 2 doesn't stop members booking that field. It's on the roadmap. In a pilot, staff would book the station themselves to block it.

## 10. Demo login, not real auth

**Decision.** One tap to be Sam (member) or Jordan (staff). The cookie only says which demo user you picked.

**Why.** A public demo must not collect real credentials, and recruiters should get in instantly. Real sign-in (email magic link) is solved technology, so building it would show nothing new about the product.

**Risk accepted.** Anyone can open the staff view on the demo. That's fine for synthetic data, and it's exactly why the data must stay synthetic.

## 11. Accessibility basics from the start

The case study made accessibility a Must (F24) because older members are the adoption risk. The MVP includes:
- Tap targets of at least 44 px.
- Text sized in `rem`, so it scales with the phone's text setting.
- The wireframe green darkened slightly to pass WCAG AA contrast with white text.
- Labels on every form field.
- A hidden text version of the busy chart for screen readers.

A dedicated large-text / high-contrast mode is on the roadmap. It hasn't been formally audited.

## 12. Stack: chosen for one-command local runs and free hosting

Next.js on Vercel, SQLite locally and Turso (hosted SQLite) in production. Same code in both places; a single environment variable switches between them. I chose plain SQL over an ORM to keep the number of concepts small. The rules are in `lib/` and are tested against a real temporary database, not mocks.

**Tradeoff.** No live push updates; the desk updates when the page reloads. Fine for a demo, but the PRD asks for the console to update within 60 seconds of a booking, so auto-refresh is on the roadmap.

---

## Quick answers for interviews

- **"What was hardest to decide?"** Cutting live stock. It was the strongest research signal, and also the riskiest dependency. "Request + confirm" kept most of the value and made the dependency a later, evidence-driven decision.
- **"How would you know it's working?"** Self-serve booking share (North Star, shown live on the desk), no-show rate (now measurable), and zero double-bookings (guardrail, enforced by the database). For pickup: decline rate and time to decision.
- **"What would you build next?"** Reminders with one-tap cancel, because no-shows carry the business case. Then the read-only POS feed, if the decline rate shows members are guessing.
- **"What did AI do vs you?"** I wrote the case study, set the scope and priorities, made the product calls in this file, and tested the app. Claude Code wrote most of the code under my direction.
