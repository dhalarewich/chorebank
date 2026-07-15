import type { AppState, Child, Redemption, Reward } from "@/types/chore-board";

export interface LiveBoardPayload {
  householdId: string;
  currentDay: number;
  currentWeekStart?: number;
  paydayDay: number;
  interestRate: number;
  kidsScreen: AppState["kidsScreen"];
  settings: AppState["settings"];
  children: Child[];
  redemptions: Redemption[];
  paydaySummary: AppState["paydaySummary"];
}

export interface LiveBoardResponse {
  state: LiveBoardPayload;
}

export interface RewardsResponse {
  rewards: Reward[];
}
