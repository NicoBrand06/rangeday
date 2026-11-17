# RangeDay: product notes

The key decisions behind this MVP, what each one traded away, and what would make me change my mind. Written so I can explain any of them in an interview.

Source material: [the case study](RangeDay_Product_Case_Study.pdf) (discovery, RICE, roadmap, metrics) and [wireframes](wireframes.html). All data is synthetic.

**How to read this.** Sections 1–12 are the original MVP decisions. Sections 13–25 cover the beta: real accounts, club settings, event series and waitlists, and the booking-types and lessons update. Where the beta changed an earlier decision, the earlier section says so.

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
| Slot length | 30 min, from opening; hours are now a club setting (beta) | Matches the wireframe; roughly one round of trap or skeet |
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

> *Updated in the beta (see 15): the meter is now per area and measures each booking type its own way. It also works for any day.*

**Decision.** "How busy" = booked station-time ÷ available station-time, per hour. Under 35% is quiet, 35–69% moderate, and 70% or more busy. The same number appears as *Peak utilization* on the desk.

**Why.** One definition, two audiences. Members see crowd levels; operations see the metric (target: 71% → 80% on Saturday mornings).

**Tradeoff.** It's based on bookings, not people actually on site. It counts stations, not party size, so a solo shooter and a squad of five weigh the same. Good enough to steer members to quieter times. It would get sharper with check-in data.

**Also:** it's today-only on the member side. Showing it for any chosen day on the booking screen is a cheap follow-up.

## 9. Events are protected against overfilling

> *Updated in the beta (see 20): a full event now offers a waitlist instead of refusing.*

**Decision.** An RSVP is added in a single database step that only succeeds if there's still room. Staff can't lower capacity below current RSVPs. A cancelled event stays visible, marked *Cancelled*, so members who RSVP'd notice.

**Known gap.** Events don't block station bookings. A clinic on Skeet Field 2 doesn't stop members booking that field. It's on the roadmap. In a pilot, staff would book the station themselves to block it.

## 10. Demo login, not real auth

> *Replaced in the beta (see 21): real email/password accounts. The one-tap demo logins remain, but only when `DEMO_MODE` is on.*

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

# Beta: booking types and lessons (decision log)

## 13. Three booking types instead of one model

**Decision.** Each area has a type set in club settings:
- **Slot-booked:** your own field per slot.
- **Shared:** bookable up to N people per slot.
- **Walk-around:** never booked.

**Why.** The first build treated everything like a trap field. That's wrong for how a ranch is actually used:
- **The clays course** is 15 stations people walk around in any order. Booking "Group A at 10:00" invented a constraint that doesn't exist.
- **The flat range, pond and archery range** hold several parties at once.
- **Trap, skeet and 5-Stand** really are one squad per field.

One model would either over-restrict the open areas or allow double-booking on the fields.

**Alternatives considered.**
- *Make everything bookable with a big capacity.* Rejected: a "full" clays course isn't a real state, and members would book "just in case".
- *Hard-code which areas behave how.* Rejected: every club is different, so the type is a setting.

**Tradeoff.** Three code paths and three explanations for members. Each area's booking screen says in one line how it works.

## 14. The clays course is not booked at all

**Decision.** No booking for walk-around areas. Members can optionally tap **"Planning to come?"** (non-binding, no limit), and staff **check in** arrivals: either a member's planned visit, or a walk-in group with just a headcount.

**Why.** Requiring a booking for a course that never fills adds friction and buys nothing. What members actually want to know is *"will it be crowded?"*

**Tradeoff.** The busy level is an estimate, and it depends on staff checking people in. If the desk is slammed and skips check-ins, the course looks quieter than it is. Walk-in check-in is one tap plus a number, to keep that cost low.

**What would change my mind.** If check-ins are often missed (for example, check-ins far below the till's green-fee count), move to QR self check-in at the first station.

## 15. Busyness: one formula per type, the same three levels everywhere

| Type | Measure | Capacity |
|---|---|---|
| Slot-booked | parties booked | fields × slots in the hour |
| Shared | people booked | limit × slots in the hour |
| Walk-around | estimated people on the course (peak in the hour) | the "gets busy at" number (default 30) |

Under 35% is **Quiet**, 35–69% **Moderate** and 70% or more **Busy**, for every area. The whole-club view is the average of the areas.

**Tradeoff.** Averaging treats a quiet pond and a packed trap field as "moderate overall". That's why the home screen shows every area's own level directly under the club-wide chart.

## 16. Expected visitors count only for times still ahead

**Decision.**
- **Check-ins** always count.
- **Planned visits** count only for times that haven't happened yet. A planned visit that never checked in drops out of the past.

**Why.** For the future, plans are the only signal. For the past, they'd be fiction: a member who planned to come at 10 and didn't shouldn't make 10 am look busy.

## 17. A round lasts about 2 hours (configurable)

**Decision.** A check-in or planned visit counts as "on the course" for one round, `roundMinutes`, default 120.

**Why.** Someone who checks in at 10:00 is on the course until about noon. Counting them only in the 10:00 slot would make the course look empty at 11.

**Tradeoff.** Fast and slow groups differ. A club can tune the number in Policies. A "checked out" tap would be more accurate, but people forget to do it.

## 18. Shared areas: the limit is checked and saved in one step

**Decision.** A shared booking is one SQL statement: *insert only if the people already booked plus this party ≤ the limit.*

**Why.** "Check, then insert" has a gap: two members could each see 4 of 5 and both book. A test fires 10 simultaneous single bookings at a 5-person pond, and exactly 5 succeed.

**Tradeoff.** No field is assigned within a shared area. That's realistic: nobody owns a lane on the pond bank.

## 19. Lessons

**Decisions.**
- **Fixed length** (`lessonMinutes`, default 60) on a 30-minute grid. One length keeps the member flow to three taps. Per-instructor or per-discipline lengths are a later setting if instructors ask.
- **No double-booking an instructor.** Lessons can overlap (9:00 and 9:30), so a simple unique index isn't enough. The insert only succeeds if no booked lesson for that instructor, *or that member*, overlaps. It's one statement, so simultaneous requests can't both win; a test checks this.
- **Open times** come from the instructor's weekly windows (up to two a day, for a lunch break), minus days off, booked lessons, past times and time outside club hours.
- **Blocking a day that already has lessons is allowed, with a warning** listing the affected members. Lessons aren't cancelled automatically. *Why:* instructors get sick, and the system shouldn't stop staff recording reality. But members deserve a phone call, not a silent cancellation.
- **Inactive, not deleted.** Deactivating an instructor hides them from booking; booked lessons and history stay.
- **Lessons don't reserve a field (yet).** A trap lesson doesn't block a trap field. *Tradeoff:* a rare clash on busy days. *Mitigation:* staff can book the field too. *Later:* link lessons to a field.

## 20. Event waitlists

**Decision.** RSVPs to a full event join a waitlist. When a place opens (a cancellation, or staff adding places), the earliest person is promoted automatically, in one database step that never fills past capacity.

**Why.** "Full, check back later" loses demand and creates unfairness: whoever refreshes most often wins. Members see their position ("#2 on the waitlist").

**Tradeoff.** Promotion is silent until notifications exist, so a promoted member finds out in the app. This is the first thing `lib/notify.ts` should send.

**Series.** Weekly, monthly (nth weekday) and yearly rules generate dates about 12 weeks ahead, topped up automatically. Staff can edit one date or "this and all later", and cancel one date or end the series.

## 21. Real accounts, built without an auth library

**Decision.** Email and password with Node's built-in scrypt, random session tokens stored only as hashes, 30-day sessions, and a 15-minute lockout after 5 wrong passwords. Every staff page **and** every staff action checks the role on the server. The `proxy.ts` redirect is a convenience, not the security boundary.

**Why no library.** Fewer moving parts to explain and maintain for a small app. The tradeoff is owning the details, so they're covered by tests (hashing, lockout, expiry, reset).

**Email waits.** Sending email needs a provider and domain setup. Until then, staff issue a one-time temporary password from the People page, and confirmations are shown in the app.

## 22. A demo-mode switch protects both the demo and real clubs

- **On (public portfolio link):**
  - Demo logins and synthetic data.
  - Weekly reset.
  - **Branding locked**, so visitors can't deface it.
  - **The shared demo staff login can't touch real sign-ups.** Otherwise anyone could reset a real person's password.
  - Emails masked.
- **Off (a real club):** no fake members, no demo buttons, and **nothing is ever auto-wiped.** The prototype wiped data weekly; that would be unacceptable with real members.

## 23. Settings over code

**Decision.** Everything a club would change is in one staff Settings page, validated on the server:
- Name, logo and colours (with a contrast warning).
- Hours.
- Areas, booking types and limits.
- Fields.
- Shop items.
- Policies: booking window, daily limit, cancel cut-off, pickup expiry, round length, lesson length and time zone.

**Why.** The same app can serve another club without a developer.

## 24. Pickup requests expire without a scheduled job

**Decision.** Pending requests expire X days after they're made, and confirmed holds X days after confirmation. Expiry is applied whenever reservations are read.

**Why.** No cron job to host or forget, and the result is identical from anyone's point of view.

**Tradeoff.** An expired row only changes status when someone looks. That's fine, because nobody can see a reservation without reading it.

## 25. Why Turso stayed

It was already a real hosted database with persistence across users and devices. Moving to Postgres would have meant a rewrite for no user-visible benefit at this scale. Numbered migrations now let the schema change without wipes.

---

## Quick answers for interviews

- **"What changed after building it?"** A walk-around clays course isn't a bookable resource. Treating it like a trap field invented a constraint, so I split areas into three booking types and made the type a club setting.
- **"What was hardest to decide?"** Cutting live stock. It was the strongest research signal, and also the riskiest dependency. "Request + confirm" kept most of the value and made the dependency a later, evidence-driven decision.
- **"How would you know it's working?"** Self-serve booking share (North Star, shown live on the desk), no-show rate (now measurable), and zero double-bookings (guardrail, enforced by the database). For pickup: decline rate and time to decision.
- **"What would you build next?"** Reminders with one-tap cancel, because no-shows carry the business case. Then the read-only POS feed, if the decline rate shows members are guessing.
- **"What did AI do vs you?"** I wrote the case study, set the scope and priorities, made the product calls in this file, and tested the app. Claude Code wrote most of the code under my direction.
