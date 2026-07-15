import type { AppState, Child, ChildId, DayDef, PaydaySummary, Reward } from "@/types/chore-board";

export const DAYS: DayDef[] = [
  { key: "sat", label: "Sat", date: 1 },
  { key: "sun", label: "Sun", date: 2 },
  { key: "mon", label: "Mon", date: 3 },
  { key: "tue", label: "Tue", date: 4 },
  { key: "wed", label: "Wed", date: 5 },
  { key: "thu", label: "Thu", date: 6 },
  { key: "fri", label: "Fri", date: 7 },
];

export const REWARDS: Reward[] = [
  { id: "pick-dinner", name: "Pick Dinner", icon: "🍽️", cost: 10, desc: "You choose what the family has for dinner." },
  { id: "screen-time", name: "Screen Time", icon: "📺", cost: 15, desc: "Extra screen time after chores are done." },
  { id: "movie-night", name: "Movie Night Pick", icon: "🎬", cost: 20, desc: "Pick the movie for family movie night." },
  { id: "ice-cream", name: "Ice Cream Outing", icon: "🍦", cost: 30, desc: "A trip to the ice cream shop. You pick your flavor!" },
  { id: "stay-up-late", name: "Stay Up Late", icon: "🌙", cost: 40, desc: "Stay up a little later this weekend." },
  { id: "toy-store", name: "Toy Store Trip", icon: "🧸", cost: 75, desc: "A small toy trip with a parent." },
  { id: "adventure-day", name: "Adventure Day", icon: "🎢", cost: 100, desc: "A bigger outing day adventure." },
  { id: "camping", name: "Camping Trip", icon: "🏕️", cost: 150, desc: "An overnight family camping trip." },
];

export const INITIAL_CHILDREN: Child[] = [
  {
    id: "primary",
    name: "Casey",
    age: 8,
    avatar: "🦊",
    accent: "#E47B3A",
    coins: 12,
    chores: [
      { id: "make-bed", icon: "🛏️", label: "Make Bed", cells: ["claimed", "claimed", "claimed", "claimed", "pending", "future", "future"] },
      { id: "brush-teeth", icon: "🪥", label: "Brush Teeth", cells: ["claimed", "claimed", "claimed", "claimed", "pending", "future", "future"] },
      { id: "tidy-room", icon: "✨", label: "Tidy Room", cells: ["claimed", "claimed", "empty", "claimed", "empty", "future", "future"] },
      { id: "water-plants", icon: "🪴", label: "Water Plants", cells: ["claimed", "claimed", "claimed", "claimed", "pending", "future", "future"] },
      { id: "reading", icon: "📚", label: "Reading", cells: ["claimed", "claimed", "claimed", "claimed", "claimed", "future", "future"] },
    ],
    bonus: ["empty", "claimed", "empty", "empty", "empty", "future", "future"],
  },
  {
    id: "secondary",
    name: "Riley",
    age: 6,
    avatar: "🐰",
    accent: "#E06B96",
    coins: 8,
    chores: [
      { id: "make-bed", icon: "🛏️", label: "Make Bed", cells: ["claimed", "claimed", "claimed", "empty", "pending", "future", "future"] },
      { id: "brush-teeth", icon: "🪥", label: "Brush Teeth", cells: ["claimed", "claimed", "pending", "pending", "pending", "future", "future"] },
      { id: "tidy-room", icon: "✨", label: "Tidy Room", cells: ["claimed", "empty", "claimed", "claimed", "empty", "future", "future"] },
      { id: "put-away-toys", icon: "🧸", label: "Put Away Toys", cells: ["claimed", "claimed", "claimed", "claimed", "pending", "future", "future"] },
      { id: "reading", icon: "📚", label: "Reading", cells: ["claimed", "claimed", "empty", "claimed", "claimed", "future", "future"] },
    ],
    bonus: ["empty", "empty", "claimed", "empty", "empty", "future", "future"],
  },
];

export const DEFAULT_SUMMARY = {
  primary: { carried: 12, stars: 30, interest: 1, newBalance: 43 },
  secondary: { carried: 8, stars: 27, interest: 1, newBalance: 36 },
};

function getDefaultWeekStartMs(nowMs: number): number {
  const date = new Date(nowMs);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  const daysSinceSaturday = (day + 1) % 7;
  date.setDate(date.getDate() - daysSinceSaturday);
  return date.getTime();
}

export function createInitialCelebrationVisuals(summary: Record<string, PaydaySummary> = DEFAULT_SUMMARY) {
  return Object.fromEntries(
    Object.entries(summary).map(([childId, value]) => [
      childId,
      { showStars: false, showInterest: false, stars: 0, interest: 0, balance: value.carried },
    ]),
  );
}

export function createInitialState(now = Date.now()): AppState {
  return {
    view: "kids",
    kidsScreen: "active",
    parentScreen: "home",
    narrowChildId: "primary",
    storeNarrowChildId: "primary",
    parentSelectedChildId: "primary",
    parentSelectedChoreId: "make-bed",
    parentSelectedDay: 4,
    currentDay: 4,
    currentWeekStart: getDefaultWeekStartMs(now),
    paydayDay: 6,
    interestRate: 5,
    showPaydayCTAHome: false,
    queueTab: "pending",
    settings: { sounds: true, animations: true },
    children: structuredClone(INITIAL_CHILDREN),
    paydaySummary: structuredClone(DEFAULT_SUMMARY),
    celebrationPlayed: false,
    awardToast: null,
    lastClaim: null,
    modal: null,
    redemptions: [
      { id: "r1", childId: "primary", rewardId: "ice-cream", createdAt: now - 2 * 60 * 60 * 1000, status: "pending" },
      { id: "r2", childId: "secondary", rewardId: "pick-dinner", createdAt: now - 28 * 60 * 60 * 1000, status: "pending" },
      { id: "r3", childId: "primary", rewardId: "screen-time", createdAt: now - 52 * 60 * 60 * 1000, status: "pending" },
      { id: "r4", childId: "primary", rewardId: "movie-night", createdAt: now - 74 * 60 * 60 * 1000, status: "fulfilled", fulfilledAt: now - 72 * 60 * 60 * 1000 },
    ],
    celebrationVisuals: structuredClone(createInitialCelebrationVisuals()),
    celebrationSeed: now,
  };
}

export function isChildId(value: string): value is ChildId {
  return value === "primary" || value === "secondary";
}
