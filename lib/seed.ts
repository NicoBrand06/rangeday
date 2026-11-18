import type { Client, InStatement } from "@libsql/client";
import { DEFAULTS, DEFAULT_HOURS, getConfig, saveSettings, slotsFor } from "./config";
import { ensureOccurrences } from "./events";
import { addDays, clubNow, weekday } from "./time";

// Two kinds of starting data:
// - seedClub(): what any new club starts with: settings, hours, session types, stations,
//   pro shop items and the event calendar. No people.
// - seedDemo(): synthetic members, bookings, RSVPs and reservations, only in DEMO_MODE.
// Every name and number here is made up. Oak & Feather Ranch is fictional.

export const DEMO_MEMBER_NO = "1042"; // Sam
export const DEMO_STAFF_NO = "S-01"; // Jordan

// [key, label, booking type, people per slot]. See the activities table in schema.ts.
const ACTIVITIES: [string, string, "slot" | "shared" | "walkaround", number | null][] = [
  ["clays", "Sporting clays", "walkaround", 30], // 15-station course: no booking, shows how busy; "busy" from ~30 people
  ["fivestand", "5-Stand", "slot", null],
  ["trap", "Trap", "slot", null],
  ["skeet", "Skeet", "slot", null],
  ["flat", "Flat range", "shared", 5],
  ["pond", "Fishing pond", "shared", 5],
  ["archery", "Archery range", "shared", 5],
];

// [activity, name, most people in one party]
const STATIONS: [string, string, number][] = [
  ["clays", "Sporting clays course (15 stations)", 5],
  ["fivestand", "5-Stand field", 5],
  ["trap", "Trap field", 5],
  ["skeet", "Skeet field", 5],
  ["flat", "Flat range", 5],
  ["pond", "Fishing pond", 5],
  ["archery", "Archery range", 5],
];

// Fictional instructors: [name, specialty, disciplines, weekly hours [weekday, start, end][]]
const INSTRUCTORS: [string, string, string, [number, string, string][]][] = [
  ["Dale Whitcomb", "Sporting clays & trap, all levels", "clays,trap,fivestand", [[2, "09:00", "12:00"], [2, "13:00", "17:00"], [4, "09:00", "15:00"], [6, "08:00", "13:00"]]],
  ["Rosa Lindqvist", "Archery: beginners and youth", "archery", [[3, "10:00", "16:00"], [5, "12:00", "17:00"], [6, "09:00", "14:00"], [0, "10:00", "14:00"]]],
  ["Marcus Bell", "Skeet & 5-Stand, competition coaching", "skeet,fivestand,clays", [[1, "13:00", "17:00"], [5, "08:00", "12:00"], [6, "12:00", "17:00"], [0, "09:00", "13:00"]]],
];

const ITEMS: [string, string, string, number][] = [
  ["12 ga target load, 7.5 shot", "Ammunition", "Box of 25", 1199],
  ["12 ga target load, 8 shot", "Ammunition", "Box of 25", 1149],
  ["12 ga target load, 7.5 shot (flat)", "Ammunition", "Case of 10 boxes", 10999],
  ["20 ga target load, 8 shot", "Ammunition", "Box of 25", 1249],
  ["28 ga target load, 8 shot", "Ammunition", "Box of 25", 1899],
  [".410 target load, 8.5 shot", "Ammunition", "Box of 25", 1949],
  ["Shooting vest, mesh", "Apparel", "Sizes S to XXL", 5499],
  ["Ranch logo cap", "Apparel", "One size", 2400],
  ["Shell pouch, canvas", "Apparel", "Belt clip", 2999],
  ["Shooting gloves", "Apparel", "Sizes S to XL", 3499],
  ["Shooting glasses, amber", "Accessories", "One size", 3999],
  ["Shooting glasses, clear", "Accessories", "One size", 3999],
  ["Foam earplugs", "Accessories", "Pack of 10 pairs", 599],
  ["Electronic earmuffs", "Accessories", "NRR 22", 6999],
  ["Choke tube wrench", "Accessories", "Fits 12 and 20 ga", 1499],
  ["Shotgun cleaning kit", "Accessories", "12, 20 and 28 ga", 2999],
];

/** Next date on or after `from` that falls on `dow` (0 = Sunday). */
function nextWeekday(from: string, dow: number): string {
  let d = from;
  while (new Date(`${d}T12:00:00Z`).getUTCDay() !== dow) d = addDays(d, 1);
  return d;
}

export async function seedClub(db: Client, today: string) {
  await saveSettings(db, DEFAULTS);
  const stmts: InStatement[] = [];
  for (const h of DEFAULT_HOURS) {
    stmts.push({ sql: "INSERT OR REPLACE INTO hours (weekday, open, close, closed) VALUES (?,?,?,?)", args: [h.weekday, h.open, h.close, 0] });
  }
  ACTIVITIES.forEach(([key, label, mode, perSlot], i) =>
    stmts.push({ sql: "INSERT INTO activities (key, label, mode, per_slot, sort) VALUES (?,?,?,?,?)", args: [key, label, mode, perSlot, i] }),
  );
  STATIONS.forEach(([activity, name, cap], i) =>
    stmts.push({ sql: "INSERT INTO stations (id, activity, name, capacity) VALUES (?,?,?,?)", args: [i + 1, activity, name, cap] }),
  );
  ITEMS.forEach(([name, cat, detail, price], i) =>
    stmts.push({ sql: "INSERT INTO items (id, name, category, detail, price_cents) VALUES (?,?,?,?,?)", args: [i + 1, name, cat, detail, price] }),
  );

  INSTRUCTORS.forEach(([name, specialty, disciplines, hours], i) => {
    stmts.push({ sql: "INSERT INTO instructors (id, name, specialty, disciplines) VALUES (?,?,?,?)", args: [i + 1, name, specialty, disciplines] });
    for (const [weekday, start, end] of hours)
      stmts.push({ sql: "INSERT INTO instructor_hours (instructor_id, weekday, start_time, end_time) VALUES (?,?,?,?)", args: [i + 1, weekday, start, end] });
  });

  // The event calendar: three repeating series plus a one-off event.
  stmts.push(
    {
      sql: `INSERT INTO event_series (id,title,category,description,location,start_time,end_time,capacity,rule,weekday,starts_on)
            VALUES (1,'Sunset Clays','Social',?,'Clays course','17:00','19:30',24,'weekly',4,?)`,
      args: ["Our Thursday evening round: 50 targets on the clays course as the sun goes down, then drinks on the clubhouse porch. All levels welcome; squads are made up on the day.", today],
    },
    {
      sql: `INSERT INTO event_series (id,title,category,description,location,start_time,end_time,capacity,rule,weekday,nth,starts_on)
            VALUES (2,'Members Shoot','Members',?,'Clays course and 5-Stand','09:00','12:00',40,'monthly',6,1,?)`,
      args: ["The first Saturday of every month. 100 targets across the clays course and 5-Stand, with a members' lunch after. Bring your own shells or reserve them for pickup.", today],
    },
    {
      sql: `INSERT INTO event_series (id,title,category,description,location,start_time,end_time,capacity,rule,month_day,starts_on)
            VALUES (3,'Rodeo','Annual',?,'Arena and clubhouse lawn','10:00','16:00',150,'yearly','05-15',?)`,
      args: ["Once a year the ranch hosts its rodeo day: team roping and barrel racing in the arena, a fun shoot on the 5-Stand, barbecue and live music on the lawn. Members and their families.", today],
    },
    {
      sql: `INSERT INTO events (title,category,description,date,start_time,end_time,location,capacity)
            VALUES ('Color Shoot','Social',?,?,'10:00','13:00','5-Stand',30)`,
      args: ["Bright coloured targets, team format and prizes for the best-dressed squad. Teams of three; sign up on your own and we'll match you.", nextWeekday(addDays(today, 18), 6)],
    },
  );
  await db.batch(stmts, "write");
  await ensureOccurrences(db, today, true);
}

// ---------- Demo data ----------

const FIRST = ["Alex", "Blake", "Casey", "Dana", "Elliot", "Frankie", "Gray", "Harper", "Ira", "Jesse", "Kendall", "Logan", "Marlow", "Noel", "Oakley", "Parker", "Quinn", "Reese", "Sawyer", "Tatum", "Rowan", "Avery", "Emerson", "Finley", "Hayden", "Jamie", "Kai", "Lane", "Morgan", "Peyton"];
const LAST = ["Abbott", "Brennan", "Caldwell", "Dorsey", "Ellison", "Fairbanks", "Garrity", "Holloway", "Ingram", "Jessup", "Kimball", "Lockhart", "Merritt", "Northcutt", "Oakes", "Prescott", "Quarles", "Radford", "Stroud", "Thackery", "Underhill", "Vance", "Whitlock", "Yardley"];

/** Small deterministic random generator, so every reset produces the same pattern. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** How likely a slot is to be booked: weekends and mornings are busiest. */
function demand(date: string, time: string): number {
  const day = weekday(date);
  const base = day === "Sat" ? 0.62 : day === "Sun" ? 0.5 : day === "Fri" ? 0.32 : 0.2;
  const h = Number(time.slice(0, 2));
  const shape = h < 9 ? 0.8 : h < 12 ? 1.25 : h < 14 ? 0.95 : 0.6;
  return Math.min(0.95, base * shape);
}

async function chunked(db: Client, stmts: InStatement[]) {
  // One giant request can exceed a hosted database's size limit, so send in chunks.
  for (let i = 0; i < stmts.length; i += 250) await db.batch(stmts.slice(i, i + 250), "write");
}

export async function seedDemo(db: Client, now = clubNow()) {
  const cfg = await getConfig(db);
  const rand = rng(20261121);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
  const stmts: InStatement[] = [];

  // Demo accounts have no password: they're reached with the "Try the demo" buttons, only in demo mode.
  stmts.push({ sql: "INSERT INTO users (id,name,member_no,role,is_demo) VALUES (1,'Sam Whitaker',?,'member',1)", args: [DEMO_MEMBER_NO] });
  stmts.push({ sql: "INSERT INTO users (id,name,member_no,role,is_demo) VALUES (2,'Jordan Ellis',?,'staff',1)", args: [DEMO_STAFF_NO] });
  stmts.push({ sql: "INSERT INTO users (id,name,member_no,role,is_demo) VALUES (3,'Priya Raman','1210','member',1)", args: [] });
  const memberIds: number[] = [3];
  for (let i = 0; i < 58; i++) {
    const id = 5 + i;
    stmts.push({
      sql: "INSERT INTO users (id,name,member_no,role,is_demo) VALUES (?,?,?,'member',1)",
      args: [id, `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`, String(1101 + i * 13)],
    });
    memberIds.push(id);
  }

  const stations = (
    await db.execute("SELECT s.id, a.mode, a.per_slot FROM stations s JOIN activities a ON a.key = s.activity WHERE s.active = 1 ORDER BY s.id")
  ).rows.map((r) => ({ id: Number(r.id), mode: String(r.mode), perSlot: r.per_slot == null ? null : Number(r.per_slot) }));

  // Sam's own bookings: 5-Stand on the next Saturday, and the flat range last week.
  const nextSat = nextWeekday(addDays(now.date, 1), 6);
  const samBookings = [
    { station: 2, date: nextSat, time: "09:00", party: 3, status: "booked", shared: 0 }, // 5-Stand
    { station: 5, date: addDays(now.date, -5), time: "10:00", party: 2, status: "checked_in", shared: 1 }, // flat range
  ];
  const taken = new Set(samBookings.map((b) => `${b.station}|${b.date}|${b.time}`));
  for (const b of samBookings) {
    stmts.push({
      sql: "INSERT INTO bookings (user_id,station_id,date,start_time,party_size,status,source,shared) VALUES (1,?,?,?,?,?,'app',?)",
      args: [b.station, b.date, b.time, b.party, b.status, b.shared],
    });
  }

  // Everyone else: 7 days of history plus the bookable window ahead.
  // Fields get at most one party per slot and shared areas stay within their headcount.
  // The walk-around clays course has no bookings: it gets check-ins and planned visits instead.
  const perMemberDay = new Map<string, number>();
  for (let d = -7; d < cfg.bookingDays; d++) {
    const date = addDays(now.date, d);
    const fade = d <= 2 ? 1 : d <= 7 ? 0.75 : 0.4; // people book closer to the day
    for (const s of stations) {
      if (s.mode === "walkaround") continue;
      for (const time of slotsFor(cfg, date)) {
        if (taken.has(`${s.id}|${date}|${time}`)) continue;
        const want = demand(date, time) * fade;
        const tries = s.mode === "slot" ? 1 : 3;
        let people = 0;
        for (let t = 0; t < tries; t++) {
          if (rand() > (s.mode === "shared" ? want * 0.6 : want)) continue;
          const party = 1 + Math.floor(rand() * (s.mode === "shared" ? 2 : 4));
          if (s.mode === "shared" && people + party > (s.perSlot ?? 5)) break;
          let member = pick(memberIds);
          for (let k = 0; (perMemberDay.get(`${member}|${date}`) ?? 0) >= cfg.maxPerDay && k < 20; k++) member = pick(memberIds);
          const key = `${member}|${date}`;
          if ((perMemberDay.get(key) ?? 0) >= cfg.maxPerDay) continue;
          perMemberDay.set(key, (perMemberDay.get(key) ?? 0) + 1);
          people += party;

          const inPast = date < now.date || (date === now.date && time < now.time);
          const r = rand();
          let status = "booked";
          if (inPast) status = r < 0.08 ? "no_show" : r < 0.12 && date === now.date ? "booked" : "checked_in";
          else if (r < 0.04) status = "cancelled";
          stmts.push({
            sql: "INSERT INTO bookings (user_id,station_id,date,start_time,party_size,status,source,shared) VALUES (?,?,?,?,?,?,?,?)",
            args: [member, s.id, date, time, party, status, rand() < 0.45 ? "phone" : "app", s.mode === "slot" ? 0 : 1],
          });
        }
      }
    }
  }

  // Clays course: walk-in groups and checked-in visits in the past, planned visits ahead.
  for (let d = -7; d < cfg.bookingDays; d++) {
    const date = addDays(now.date, d);
    for (const time of slotsFor(cfg, date)) {
      const groups = Math.round(demand(date, time) * (d <= 2 ? 5 : d <= 7 ? 3 : 1.5) * (0.5 + rand()));
      for (let g = 0; g < groups; g++) {
        const past = date < now.date || (date === now.date && time <= now.time);
        const party = 1 + Math.floor(rand() * 4);
        const walkIn = past && rand() < 0.4;
        stmts.push({
          sql: "INSERT INTO visits (activity,user_id,date,time,party_size,kind,source) VALUES ('clays',?,?,?,?,?,?)",
          args: [walkIn ? null : pick(memberIds), date, time, party, past ? "checked_in" : "expected", walkIn ? "desk" : "app"],
        });
      }
    }
  }
  stmts.push({
    sql: "INSERT INTO visits (activity,user_id,date,time,party_size,kind,source) VALUES ('clays',1,?,'10:00',2,'expected','app')",
    args: [addDays(now.date, 2)],
  });

  // Lessons: a few booked on the instructors' upcoming days, using the real booking rules
  // (so they can never double-book). Members must be saved first.
  await chunked(db, stmts);
  stmts.length = 0;
  const { availableInstructors, bookLesson } = await import("./lessons");
  const learners = [1, ...memberIds.slice(0, 12)];
  let li = 0;
  for (let d = 1; d < Math.min(cfg.bookingDays, 10); d++) {
    const date = addDays(now.date, d);
    for (const discipline of ["clays", "archery", "skeet"]) {
      for (const { instructor, times } of await availableInstructors(db, cfg, discipline, date, now)) {
        if (!times.length || rand() > 0.6) continue;
        const time = times[Math.floor(rand() * times.length)];
        await bookLesson(db, cfg, { instructorId: instructor.id, userId: learners[li++ % learners.length], discipline, date, time, source: rand() < 0.5 ? "phone" : "app" }, now);
      }
    }
  }

  // RSVPs: fill the next Sunset Clays (with a waitlist) and part of the rest.
  const events = (await db.execute({ sql: "SELECT id, title, capacity FROM events WHERE date >= ? AND cancelled = 0 ORDER BY date", args: [now.date] })).rows;
  let firstSunset = true;
  for (const e of events) {
    const cap = Number(e.capacity);
    let going = Math.min(memberIds.length, Math.floor(cap * (0.3 + rand() * 0.5)));
    let waitlist = 0;
    if (e.title === "Sunset Clays" && firstSunset) {
      going = cap;
      waitlist = 2;
      firstSunset = false;
    }
    for (let k = 0; k < going + waitlist && k < memberIds.length; k++) {
      stmts.push({
        sql: "INSERT INTO rsvps (event_id,user_id,status,created_at) VALUES (?,?,?,datetime('now', ?))",
        args: [Number(e.id), memberIds[(k * 7 + Number(e.id)) % memberIds.length], k < going ? "going" : "waitlist", `-${(going + waitlist - k) * 3} minutes`],
      });
    }
  }
  const membersShoot = events.find((e) => e.title === "Members Shoot");
  if (membersShoot) stmts.push({ sql: "INSERT OR IGNORE INTO rsvps (event_id,user_id,status) VALUES (?,1,'going')", args: [Number(membersShoot.id)] });

  // [member, item, qty, status, staff note, hours ago]
  const reservations: [number, number, number, string, string | null, number][] = [
    [1, 11, 1, "confirmed", "Set aside behind the counter, under your name.", 26],
    [3, 3, 1, "pending", null, 5],
    [12, 14, 1, "pending", null, 3],
    [20, 1, 4, "pending", null, 1],
    [27, 7, 1, "declined", "Sorry, size L is sold out until the next delivery.", 30],
  ];
  for (const [user, item, qty, status, note, ago] of reservations) {
    const changed = `-${Math.max(0, ago - 2)} hours`;
    stmts.push({
      sql: `INSERT INTO reservations (user_id,item_id,quantity,status,staff_note,created_at,confirmed_at,updated_at)
            VALUES (?,?,?,?,?,datetime('now', ?),CASE WHEN ? = 'confirmed' THEN datetime('now', ?) END,datetime('now', ?))`,
      args: [user, item, qty, status, note, `-${ago} hours`, status, changed, changed],
    });
  }
  // "Let the shop know" requests: [member, area, type, note, status, hours ago]. Jordan (staff, id 2) handled the older ones.
  const requests: [number, string, string, string, string, number][] = [
    [1, "flat", "help", "Can someone unlock the flat range shed and bring out targets?", "in_progress", 1],
    [14, "trap", "equipment", "Trap launcher is out of clays.", "open", 0.4],
    [3, "archery", "equipment", "Target butt on lane 3 is coming apart at the back.", "open", 3],
    [22, "clays", "equipment", "Station 9 trap is throwing short and low.", "open", 6],
    [31, "pond", "other", "Dock rail on the east side is loose. Not urgent, just a heads-up.", "done", 30],
    [1, "trap", "equipment", "Trap launcher jammed twice during my round.", "done", 50],
    [40, "trap", "equipment", "Trap machine out of clays again.", "done", 75],
    [9, "fivestand", "help", "Could we get an extra bucket of clays for the 2 pm group?", "done", 98],
  ];
  for (const [user, area, type, note, status, ago] of requests) {
    const t = (h: number) => `-${Math.round(h * 60)} minutes`;
    stmts.push({
      sql: `INSERT INTO shop_requests (user_id,activity,type,note,status,created_at,started_by,started_at,done_by,done_at)
            VALUES (?,?,?,?,?,datetime('now', ?),
                    CASE WHEN ? != 'open' THEN 2 END, CASE WHEN ? != 'open' THEN datetime('now', ?) END,
                    CASE WHEN ? = 'done' THEN 2 END, CASE WHEN ? = 'done' THEN datetime('now', ?) END)`,
      args: [user, area, type, note, status, t(ago), status, status, t(ago * 0.8), status, status, t(ago * 0.6)],
    });
  }

  await chunked(db, stmts);
  await db.execute({ sql: "INSERT OR REPLACE INTO meta (key, value) VALUES ('demo_seeded_on', ?)", args: [now.date] });
}
