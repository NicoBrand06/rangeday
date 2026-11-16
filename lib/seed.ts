import type { Client, InStatement } from "@libsql/client";
import { POLICY, SLOTS } from "./club";
import { addDays, clubNow, weekday } from "./time";
import { createTables, dropTables } from "./schema";

// Synthetic demo data. Every name and number here is made up.
// Bookings are generated relative to "today", so the demo never looks stale.

export const DEMO_MEMBER_ID = 1; // Sam
export const DEMO_STAFF_ID = 2; // Jordan

const FIRST = ["Alex", "Blake", "Casey", "Dana", "Elliot", "Frankie", "Gray", "Harper", "Ira", "Jesse", "Kendall", "Logan", "Marlow", "Noel", "Oakley", "Parker", "Quinn", "Reese", "Sawyer", "Tatum", "Rowan", "Avery", "Emerson", "Finley", "Hayden", "Jamie", "Kai", "Lane", "Morgan", "Peyton"];
const LAST = ["Abbott", "Brennan", "Caldwell", "Dorsey", "Ellison", "Fairbanks", "Garrity", "Holloway", "Ingram", "Jessup", "Kimball", "Lockhart", "Merritt", "Northcutt", "Oakes", "Prescott", "Quarles", "Radford", "Stroud", "Thackery", "Underhill", "Vance", "Whitlock", "Yardley"];

const STATIONS: [string, string, number][] = [
  ["clays", "Clays course, Group A", 5],
  ["clays", "Clays course, Group B", 5],
  ["clays", "Clays course, Group C", 5],
  ["fivestand", "5-Stand, Field 1", 5],
  ["fivestand", "5-Stand, Field 2", 5],
  ["trap", "Trap, Field 1", 5],
  ["trap", "Trap, Field 2", 5],
  ["skeet", "Skeet, Field 1", 5],
  ["skeet", "Skeet, Field 2", 5],
];

const ITEMS: [string, string, string, number][] = [
  ["12 ga target load, 7.5 shot", "Ammunition", "Box of 25", 1199],
  ["12 ga target load, 8 shot", "Ammunition", "Box of 25", 1149],
  ["12 ga target load, 7.5 shot (flat)", "Ammunition", "Case of 10 boxes", 10999],
  ["20 ga target load, 8 shot", "Ammunition", "Box of 25", 1249],
  ["28 ga target load, 8 shot", "Ammunition", "Box of 25", 1899],
  [".410 target load, 8.5 shot", "Ammunition", "Box of 25", 1949],
  ["Shooting vest, mesh", "Apparel", "Sizes S to XXL", 5499],
  ["Club logo cap", "Apparel", "One size", 2400],
  ["Shell pouch, canvas", "Apparel", "Belt clip", 2999],
  ["Shooting gloves", "Apparel", "Sizes S to XL", 3499],
  ["Shooting glasses, amber", "Accessories", "One size", 3999],
  ["Shooting glasses, clear", "Accessories", "One size", 3999],
  ["Foam earplugs", "Accessories", "Pack of 10 pairs", 599],
  ["Electronic earmuffs", "Accessories", "NRR 22", 6999],
  ["Choke tube wrench", "Accessories", "Fits 12 and 20 ga", 1499],
  ["Shotgun cleaning kit", "Accessories", "12, 20 and 28 ga", 2999],
];

type EventSeed = [string, string, string, number, string, string, string, number, number];
// [title, category, description, daysFromToday, start, end, location, capacity, rsvps]
const EVENTS: EventSeed[] = [
  ["New Shooter Clinic", "Clinic", "A relaxed two-hour intro for members who are new to clays, or who want to bring a family member along. Covers safety, gun fit and stance, then a coached round on the 5-Stand. Club guns and shells provided.", 3, "09:00", "11:00", "5-Stand, Field 1", 8, 6],
  ["Saturday Sporting Clays League", "League", "Weekly league round on the full clays course. Squads of five are drawn at 8:45. Scores go on the clubhouse board.", 5, "08:30", "12:00", "Clays course", 30, 22],
  ["Skeet Doubles Workshop", "Clinic", "Coach-led session on station 3, 4 and 5 doubles. Bring 100 shells. Limited to 6 so everyone gets real coaching time.", 8, "13:00", "15:30", "Skeet, Field 2", 6, 6],
  ["Wobble Trap Night", "Social", "Floodlit wobble trap followed by chili in the clubhouse. A fun one; all levels welcome.", 10, "16:00", "19:00", "Trap, Field 1", 20, 11],
  ["Safety and Range Etiquette Refresher", "Clinic", "Required once a year for all members. 45 minutes in the clubhouse, then a quick walk of the course. Counts toward your annual safety sign-off.", 12, "10:00", "10:45", "Clubhouse", 25, 9],
  ["Winter 5-Stand Fun Shoot", "Social", "Three menus of 25 targets with handicaps so every level has a chance. Prizes for top three and for most improved.", 17, "09:30", "13:00", "5-Stand, Fields 1 and 2", 24, 7],
  ["Junior Shooting Clinic", "Clinic", "For members' children aged 12 to 17, with a parent or guardian present. Small groups with certified instructors.", 20, "10:00", "12:00", "Trap, Field 2", 10, 3],
  ["Annual Members' Charity Shoot", "Tournament", "Our biggest day of the year. 100-target sporting clays, lunch, raffle and awards. All proceeds go to the county youth conservation fund.", 26, "08:00", "15:00", "Clays course", 60, 31],
];

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

export async function seed(db: Client, now = clubNow()) {
  await dropTables(db);
  await createTables(db);
  const rand = rng(20261121);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
  const stmts: InStatement[] = [];

  // People. Sam (member) and Jordan (staff) are the two demo logins.
  stmts.push({ sql: "INSERT INTO users (id,name,member_no,role) VALUES (1,'Sam Whitaker','1042','member')", args: [] });
  stmts.push({ sql: "INSERT INTO users (id,name,member_no,role) VALUES (2,'Jordan Ellis','S-01','staff')", args: [] });
  stmts.push({ sql: "INSERT INTO users (id,name,member_no,role) VALUES (3,'Priya Raman','1210','member')", args: [] });
  stmts.push({ sql: "INSERT INTO users (id,name,member_no,role) VALUES (4,'Morgan Hale','S-02','staff')", args: [] });
  const memberIds: number[] = [3];
  for (let i = 0; i < 58; i++) {
    const id = 5 + i;
    const memberNo = String(1101 + i * 13); // 1101, 1114, ... never clashes with 1042 or 1210
    stmts.push({
      sql: "INSERT INTO users (id,name,member_no,role) VALUES (?,?,?,'member')",
      args: [id, `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`, memberNo],
    });
    memberIds.push(id);
  }

  STATIONS.forEach(([activity, name, cap], i) =>
    stmts.push({ sql: "INSERT INTO stations (id,activity,name,capacity) VALUES (?,?,?,?)", args: [i + 1, activity, name, cap] }),
  );

  // Sam's own bookings: one coming up on the next Saturday, one last week.
  let nextSat = addDays(now.date, 1);
  while (weekday(nextSat) !== "Sat") nextSat = addDays(nextSat, 1);
  const samBookings = [
    { station: 5, date: nextSat, time: "09:00", party: 3, status: "booked" },
    { station: 1, date: addDays(now.date, -5), time: "10:00", party: 2, status: "checked_in" },
  ];
  const taken = new Set(samBookings.map((b) => `${b.station}|${b.date}|${b.time}`));
  for (const b of samBookings) {
    stmts.push({
      sql: "INSERT INTO bookings (user_id,station_id,date,start_time,party_size,status,source) VALUES (1,?,?,?,?,?,'app')",
      args: [b.station, b.date, b.time, b.party, b.status],
    });
  }

  // Everyone else: 7 days of history plus the bookable window ahead.
  const perMemberDay = new Map<string, number>();
  for (let d = -7; d < POLICY.daysAhead; d++) {
    const date = addDays(now.date, d);
    for (let s = 1; s <= STATIONS.length; s++) {
      for (const time of SLOTS) {
        if (taken.has(`${s}|${date}|${time}`)) continue;
        // Bookings thin out further ahead: people book closer to the day.
        const fade = d <= 2 ? 1 : d <= 7 ? 0.75 : 0.4;
        if (rand() > demand(date, time) * fade) continue;
        let member = pick(memberIds);
        for (let tries = 0; (perMemberDay.get(`${member}|${date}`) ?? 0) >= POLICY.maxBookingsPerMemberPerDay && tries < 20; tries++) {
          member = pick(memberIds);
        }
        const key = `${member}|${date}`;
        if ((perMemberDay.get(key) ?? 0) >= POLICY.maxBookingsPerMemberPerDay) continue;
        perMemberDay.set(key, (perMemberDay.get(key) ?? 0) + 1);

        const inPast = date < now.date || (date === now.date && time < now.time);
        const r = rand();
        let status = "booked";
        if (inPast) status = r < 0.08 ? "no_show" : r < 0.12 && date === now.date ? "booked" : "checked_in";
        else if (r < 0.04) status = "cancelled";
        const party = 1 + Math.floor(rand() * 4);
        stmts.push({
          sql: "INSERT INTO bookings (user_id,station_id,date,start_time,party_size,status,source) VALUES (?,?,?,?,?,?,?)",
          args: [member, s, date, time, party, status, rand() < 0.45 ? "phone" : "app"],
        });
      }
    }
  }

  EVENTS.forEach(([title, cat, desc, days, start, end, loc, cap, n], i) => {
    const id = i + 1;
    stmts.push({
      sql: "INSERT INTO events (id,title,category,description,date,start_time,end_time,location,capacity) VALUES (?,?,?,?,?,?,?,?,?)",
      args: [id, title, cat, desc, addDays(now.date, days), start, end, loc, cap],
    });
    for (let k = 0; k < n; k++) {
      stmts.push({ sql: "INSERT INTO rsvps (event_id,user_id) VALUES (?,?)", args: [id, memberIds[(k * 5 + i) % memberIds.length]] });
    }
  });
  // Sam has already RSVP'd to the league round.
  stmts.push({ sql: "INSERT INTO rsvps (event_id,user_id) VALUES (2,1)", args: [] });

  ITEMS.forEach(([name, cat, detail, price], i) =>
    stmts.push({ sql: "INSERT INTO items (id,name,category,detail,price_cents) VALUES (?,?,?,?,?)", args: [i + 1, name, cat, detail, price] }),
  );
  // [member, item, qty, status, staff note, hours ago]
  const reservations: [number, number, number, string, string | null, number][] = [
    [1, 11, 1, "confirmed", "Set aside behind the counter, under your name.", 26],
    [3, 3, 1, "pending", null, 5],
    [12, 14, 1, "pending", null, 3],
    [20, 1, 4, "pending", null, 1],
    [27, 7, 1, "declined", "Sorry, size L is sold out until the next delivery.", 30],
  ];
  for (const [user, item, qty, status, note, ago] of reservations) {
    stmts.push({
      sql: `INSERT INTO reservations (user_id,item_id,quantity,status,staff_note,created_at,updated_at)
            VALUES (?,?,?,?,?,datetime('now', ?),datetime('now', ?))`,
      args: [user, item, qty, status, note, `-${ago} hours`, `-${Math.max(0, ago - 2)} hours`],
    });
  }

  stmts.push({ sql: "INSERT INTO meta (key,value) VALUES ('seeded_on',?)", args: [now.date] });
  await db.batch(stmts, "write");
}
