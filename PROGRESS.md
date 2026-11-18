# RangeDay progress

_Last updated: 2026-11-17 (evening)_

## Status
The beta, the booking update and **"Let the shop know"** are **code-complete and verified locally**. They are **not deployed yet**: the live site (rangeday.vercel.app) still runs the old prototype, "Cedar Ridge".

## Done
- **Beta foundation:**
  - Numbered database migrations.
  - Real accounts (email and password, sessions, lockout) and a staff role, checked on the server.
  - `DEMO_MODE` switch.
- **Club settings admin:** branding, hours, areas and fields, pro shop items and policies. The default club is the fictional "Oak & Feather Ranch".
- **Three booking types:**
  - **Slot-booked:** 5-Stand, Trap, Skeet. Exclusive, can be full.
  - **Shared:** Flat range, Fishing pond, Archery range. Up to 5 per slot, shown as "2 of 5 booked".
  - **Walk-around:** the 15-station clays course. No booking; Quiet/Moderate/Busy from check-ins and planned visits.
- **One field or space per area** (one of each), as the user specified.
- **Lessons:**
  - Instructors, weekly availability, days off and a schedule.
  - An instructor can't be double-booked.
- **Busy meter per area,** for all three types.
- **Events:** repeating series and waitlists with automatic promotion.
- **Pickup reservations:** expiry after X days.
- **Polish:** loading and error states, Saving… buttons, mobile and 200% text checks.
- **"Let the shop know" (2026-11-17):**
  - One-way requests and problem reports from members to pro shop staff: area, type and a note of up to 300 characters.
  - Members reach it from a **"Tell the shop" button in a top ribbon on every member screen** (moved off the Pro Shop tab at the user's request, since that tab is for reserving gear).
  - The form opens with an "Urgent or safety issue? Call the shop" line with the shop's phone number, which is a new club setting.
  - Members see their requests' status (Open / In progress / Done).
  - Staff work a queue filtered by status and area, and the app records who handled each request and when.
  - It's a permanent log (deletes are blocked) and is added by migration 2.
  - Demo mode seeds 8 sample requests.
  - While testing, I fixed a bug in the existing staff tables: they scrolled sideways on phones.
- **Verification:**
  - 92 tests pass; typecheck and `next build` are clean.
  - Browser checks pass with demo mode on and off. "Let the shop know" was checked in demo mode only.
- **Docs:** README, PRODUCT_NOTES.md decision log, refreshed screenshots.

## Next (user)
1. Commit and push in GitHub Desktop.
2. In Vercel → Settings → Environment Variables, set:
   - `DEMO_MODE=true`
   - `STAFF_EMAILS=<owner email>`

   The Turso vars are already set.
3. Redeploy, then check that the live site shows Oak & Feather Ranch.

## Later (out of scope)
- Payments and POS/inventory.
- Push, SMS and email.
- Lessons that reserve a field.
- Waitlists for fields.
- Replies, photos or notifications on shop requests.
