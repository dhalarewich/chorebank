import type { KidsScreen, StarStatus } from "@prisma/client";
import type { KidsScreen as AppKidsScreen, StarCellState } from "@/types/chore-board";

export function toAppStarStatus(status: StarStatus): StarCellState {
  if (status === "EMPTY") return "empty";
  if (status === "FUTURE") return "future";
  if (status === "PENDING") return "pending";
  return "claimed";
}

export function toPrismaStarStatus(status: StarCellState): StarStatus {
  if (status === "empty") return "EMPTY";
  if (status === "future") return "FUTURE";
  if (status === "pending") return "PENDING";
  return "CLAIMED";
}

export function toAppKidsScreen(screen: KidsScreen): AppKidsScreen {
  if (screen === "ACTIVE") return "active";
  if (screen === "PAYDAY_READY") return "paydayReady";
  if (screen === "CELEBRATION") return "celebration";
  return "closed";
}

export function toPrismaKidsScreen(screen: AppKidsScreen): KidsScreen {
  if (screen === "active") return "ACTIVE";
  if (screen === "paydayReady") return "PAYDAY_READY";
  if (screen === "celebration") return "CELEBRATION";
  return "CLOSED";
}
