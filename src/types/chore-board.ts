export type View = "kids" | "store" | "parent";
export type KidsScreen = "active" | "paydayReady" | "celebration" | "closed";
export type ParentScreen = "home" | "award" | "payday" | "redemptions" | "settings";
export type QueueTab = "pending" | "fulfilled";

export type ChildId = string;
export type RewardId = string;

export type StarCellState = "empty" | "future" | "pending" | "claimed";

export interface DayDef {
  key: "sat" | "sun" | "mon" | "tue" | "wed" | "thu" | "fri";
  label: string;
  date: number;
}

export interface Reward {
  id: RewardId;
  name: string;
  icon: string;
  cost: number;
  desc: string;
}

export interface ChoreRow {
  id: string;
  icon: string;
  label: string;
  cells: StarCellState[];
}

export interface Child {
  id: ChildId;
  name: string;
  age: number;
  avatar: string;
  accent: string;
  coins: number;
  chores: ChoreRow[];
  bonus: StarCellState[];
}

export interface PaydaySummary {
  carried: number;
  stars: number;
  interest: number;
  newBalance: number;
}

export interface Settings {
  sounds: boolean;
  animations: boolean;
}

export type RedemptionStatus = "pending" | "fulfilled";

export interface Redemption {
  id: string;
  childId: ChildId;
  rewardId: RewardId;
  createdAt: number;
  status: RedemptionStatus;
  fulfilledAt?: number;
}

export interface AwardToast {
  childId: ChildId;
  childName: string;
  rowId: string;
  choreLabel: string;
  previous: StarCellState;
  day: number;
  dayLabel: string;
  at: number;
}

export interface LastClaim {
  childId: ChildId;
  rowId: string;
  day: number;
  isBonus: boolean;
  at: number;
}

export interface RedeemModal {
  type: "redeem";
  childId: ChildId;
  rewardId: RewardId;
}

export interface CelebrationVisual {
  showStars: boolean;
  showInterest: boolean;
  stars: number;
  interest: number;
  balance: number;
}

export interface AppState {
  view: View;
  kidsScreen: KidsScreen;
  parentScreen: ParentScreen;
  narrowChildId: ChildId;
  storeNarrowChildId: ChildId;
  parentSelectedChildId: ChildId;
  parentSelectedChoreId: string;
  parentSelectedDay: number;
  currentDay: number;
  currentWeekStart: number;
  paydayDay: number;
  interestRate: number;
  showPaydayCTAHome: boolean;
  queueTab: QueueTab;
  settings: Settings;
  children: Child[];
  paydaySummary: Record<ChildId, PaydaySummary>;
  celebrationPlayed: boolean;
  awardToast: AwardToast | null;
  lastClaim: LastClaim | null;
  modal: RedeemModal | null;
  redemptions: Redemption[];
  celebrationVisuals: Record<ChildId, CelebrationVisual>;
  celebrationSeed: number;
}

export interface FallingCoin {
  id: string;
  depthClass: "near" | "mid" | "far";
  left: number;
  duration: number;
  delay: number;
  drift: number;
  scale: number;
}
