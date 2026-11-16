// Club setup and booking policy. Changing a rule here changes it everywhere.

export const CLUB_NAME = "Cedar Ridge Sporting Club";

export const ACTIVITIES = [
  { key: "clays", label: "Sporting clays", short: "Clays course" },
  { key: "fivestand", label: "5-Stand", short: "5-Stand" },
  { key: "trap", label: "Trap", short: "Trap" },
  { key: "skeet", label: "Skeet", short: "Skeet" },
] as const;

export type ActivityKey = (typeof ACTIVITIES)[number]["key"];

export function activityLabel(key: string): string {
  return ACTIVITIES.find((a) => a.key === key)?.label ?? key;
}

/** Half-hour slots from 8:00 am; the last one starts at 4:30 pm. */
export const SLOTS: string[] = Array.from({ length: 18 }, (_, i) => {
  const mins = 8 * 60 + i * 30;
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
});

export const POLICY = {
  daysAhead: 14, // members can book today plus the next 13 days
  maxBookingsPerMemberPerDay: 2,
  minParty: 1,
  cancelCutoffTime: "18:00", // members may cancel until 6 pm the day before
};
