import { createInitialCelebrationVisuals, createInitialState } from "@/lib/chore-board/defaults";
import type { AppState } from "@/types/chore-board";
import type { LiveBoardPayload } from "@/types/live-api";

export function applyLiveBoardToState(base: AppState, board: LiveBoardPayload): AppState {
  const draft = structuredClone(base) as AppState;

  draft.currentDay = board.currentDay;
  if (typeof board.currentWeekStart === "number") {
    draft.currentWeekStart = board.currentWeekStart;
  }
  draft.paydayDay = board.paydayDay;
  draft.interestRate = board.interestRate;
  draft.kidsScreen = board.kidsScreen;
  draft.children = structuredClone(board.children);
  draft.redemptions = structuredClone(board.redemptions);
  draft.paydaySummary = structuredClone(board.paydaySummary);
  draft.settings = {
    sounds: board.settings.sounds,
    animations: board.settings.animations,
  };

  const nextChildIds = new Set(draft.children.map((child) => child.id));

  if (!nextChildIds.has(draft.narrowChildId)) {
    draft.narrowChildId = draft.children[0]?.id ?? "primary";
  }

  if (!nextChildIds.has(draft.storeNarrowChildId)) {
    draft.storeNarrowChildId = draft.children[0]?.id ?? "primary";
  }

  if (!nextChildIds.has(draft.parentSelectedChildId)) {
    draft.parentSelectedChildId = draft.children[0]?.id ?? "primary";
  }

  draft.parentSelectedChoreId = draft.children[0]?.chores[0]?.id ?? "";
  draft.celebrationVisuals = structuredClone(createInitialCelebrationVisuals(draft.paydaySummary));
  draft.celebrationSeed = Date.now();

  return draft;
}

export function createHydratedState(board: LiveBoardPayload): AppState {
  return applyLiveBoardToState(createInitialState(), board);
}

export function toLiveBoardPayloadFromState(state: AppState): LiveBoardPayload {
  return {
    householdId: "demo-household",
    currentDay: state.currentDay,
    currentWeekStart: state.currentWeekStart,
    paydayDay: state.paydayDay,
    interestRate: state.interestRate,
    kidsScreen: state.kidsScreen,
    settings: state.settings,
    children: state.children,
    redemptions: state.redemptions,
    paydaySummary: state.paydaySummary,
  };
}
