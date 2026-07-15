"use client";

import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useChoreBoardApp } from "@/hooks/useChoreBoardApp";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { REWARDS, createInitialState } from "@/lib/chore-board/defaults";
import { generateChildPalette, resolveChildAccent } from "@/lib/chore-board/child-theme";
import type {
  AppState,
  Child,
  ChildId,
  ChoreRow,
  DayDef,
  Reward,
  StarCellState,
} from "@/types/chore-board";
import type { LiveBoardPayload } from "@/types/live-api";

type ActorRole = "parent" | "kid";
type AppMode = "live" | "demo";

interface AdminChoreItem {
  id: string;
  childId: string;
  slug: string;
  label: string;
  icon: string;
  sortOrder: number;
  active: boolean;
}

interface AdminRewardItem {
  id: string;
  slug: string;
  name: string;
  icon: string;
  description: string;
  cost: number;
  sortOrder: number;
  active: boolean;
}

interface SharedChoreItem {
  slug: string;
  label: string;
  icon: string;
  sortOrder: number;
  itemIdsByChild: Record<string, string>;
  activeByChild: Record<string, boolean>;
}

type SettingsSection = "children" | "chores" | "rewards" | "household" | "app";
type RouteTarget = { view: AppState["view"]; parentScreen?: AppState["parentScreen"]; settingsSection?: SettingsSection };
type PerfBucket = "settingsLoad" | "mutation" | "reorder" | "transition";

const PERF_LABELS: Record<PerfBucket, string> = {
  settingsLoad: "Settings Load",
  mutation: "Mutations",
  reorder: "Reorder",
  transition: "Route Transition",
};

const PERF_TARGETS_MS: Record<PerfBucket, number> = {
  settingsLoad: 800,
  mutation: 700,
  reorder: 450,
  transition: 180,
};

const SETTINGS_SECTIONS: Array<{ id: SettingsSection; label: string }> = [
  { id: "children", label: "Children" },
  { id: "chores", label: "Chores" },
  { id: "rewards", label: "Rewards" },
  { id: "household", label: "Household" },
  { id: "app", label: "App" },
];

function isSettingsSection(value: string | undefined): value is SettingsSection {
  return value === "children" || value === "chores" || value === "rewards" || value === "household" || value === "app";
}

function getRouteTarget(pathname: string | null): RouteTarget | null {
  if (!pathname) return null;

  if (pathname === "/kids") return { view: "kids" };
  if (pathname === "/store") return { view: "store" };
  if (pathname === "/parent") return { view: "parent", parentScreen: "home" };
  if (pathname === "/parent/award") return { view: "parent", parentScreen: "award" };
  if (pathname === "/parent/payday") return { view: "parent", parentScreen: "payday" };
  if (pathname === "/parent/redemptions") return { view: "parent", parentScreen: "redemptions" };
  if (pathname === "/parent/settings") return { view: "parent", parentScreen: "settings", settingsSection: "children" };
  if (pathname.startsWith("/parent/settings/")) {
    const section = pathname.split("/")[3];
    if (isSettingsSection(section)) {
      return { view: "parent", parentScreen: "settings", settingsSection: section };
    }
    return { view: "parent", parentScreen: "settings", settingsSection: "children" };
  }

  return null;
}

function getPathForParentScreen(screen: AppState["parentScreen"], settingsSection: SettingsSection = "children"): string {
  if (screen === "home") return "/parent";
  if (screen === "settings") return `/parent/settings/${settingsSection}`;
  return `/parent/${screen}`;
}

function formatWeekRangeLabel(currentWeekStart: number): string {
  const start = new Date(currentWeekStart);
  if (Number.isNaN(start.getTime())) return "Week";

  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  const monthFormatter = new Intl.DateTimeFormat("en-US", { month: "short" });
  const startMonth = monthFormatter.format(start);
  const endMonth = monthFormatter.format(end);
  const startDay = start.getDate();
  const endDay = end.getDate();
  return startMonth === endMonth ? `${startMonth} ${startDay}-${endDay}` : `${startMonth} ${startDay}-${endMonth} ${endDay}`;
}

function formatPaydayLabel(currentWeekStart: number, paydayDay: number): string {
  const paydayDate = new Date(currentWeekStart);
  if (Number.isNaN(paydayDate.getTime())) return "Payday";

  paydayDate.setDate(paydayDate.getDate() + Math.max(0, Math.min(6, paydayDay)));
  const formatter = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return formatter.format(paydayDate);
}

function countClaimedStars(child: Child): number {
  let claimed = 0;

  child.chores.forEach((chore) => {
    chore.cells.forEach((state) => {
      if (state === "claimed") claimed += 1;
    });
  });

  child.bonus.forEach((state) => {
    if (state === "claimed") claimed += 1;
  });

  return claimed;
}

function previewPayday(child: Child, interestRate: number) {
  const carried = child.coins;
  const stars = countClaimedStars(child);
  const interest = Math.round((carried * interestRate) / 100);
  const newBalance = carried + interest + stars;
  return { carried, stars, interest, newBalance };
}

function calculateP95(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
  return Math.round(sorted[index]);
}

function CoinUse({ width, height }: { width?: number; height?: number }) {
  return (
    <svg width={width} height={height} viewBox="0 0 24 24">
      <use href="#coin"></use>
    </svg>
  );
}

function RewardCostChip({ cost, affordable }: { cost: number; affordable: boolean }) {
  return (
    <div className={`coin-chip chip-cost ${affordable ? "" : "is-muted"}`}>
      <span className="coin-icon">
        <CoinUse />
      </span>
      <span>{cost}</span>
    </div>
  );
}

function BalanceChip({
  value,
  onTap,
  ariaLabel,
}: {
  value: number;
  onTap?: (target: HTMLButtonElement) => void;
  ariaLabel?: string;
}) {
  const content = (
    <>
      <span className="coin-icon">
        <CoinUse />
      </span>
      <div className="balance-stack">
        <div className="balance-value">{value}</div>
        <div className="balance-label">coins</div>
      </div>
    </>
  );

  if (onTap) {
    return (
      <button
        type="button"
        className="coin-chip chip-balance chip-balance-btn"
        onClick={(event) => onTap(event.currentTarget)}
        aria-label={ariaLabel}
      >
        {content}
      </button>
    );
  }

  return <div className="coin-chip chip-balance">{content}</div>;
}

function StarIcon({ state, isBonus }: { state: StarCellState; isBonus: boolean }) {
  if (state !== "claimed" && state !== "pending") return null;

  const symbol =
    state === "claimed"
      ? isBonus
        ? "star-bonus"
        : "star-claimed"
      : isBonus
        ? "star-bonus"
        : "star-pending";

  return (
    <svg viewBox="0 0 24 24">
      <use href={`#${symbol}`}></use>
    </svg>
  );
}

function BoardRow({
  child,
  chore,
  days,
  kidsScreen,
  canClaim,
  isLatestClaim,
  onClaim,
}: {
  child: Child;
  chore: ChoreRow;
  days: DayDef[];
  kidsScreen: "active" | "paydayReady" | "closed";
  canClaim: boolean;
  isLatestClaim: (childId: ChildId, rowId: string, day: number, isBonus: boolean) => boolean;
  onClaim: (target: HTMLElement, childId: ChildId, rowId: string, day: number, isBonus: boolean) => void;
}) {
  return (
    <tr>
      <td>
        <div className="chore-label">
          <span className="emoji">{chore.icon}</span>
          {chore.label}
        </div>
      </td>
      {chore.cells.map((cellState, dayIndex) => {
        const paydayCol = dayIndex === 6 ? "payday-col" : "";
        const claimable = canClaim && cellState === "pending" && kidsScreen === "active";
        const popClass = isLatestClaim(child.id, chore.id, dayIndex, false) ? " claim-pop" : "";

        return (
          <td key={`${chore.id}-${days[dayIndex].key}`} className={paydayCol}>
            <button
              type="button"
              className={`star-cell ${cellState}${popClass}`}
              data-child-id={child.id}
              data-row-id={chore.id}
              data-day={dayIndex}
              data-bonus="false"
              onClick={(event) => onClaim(event.currentTarget, child.id, chore.id, dayIndex, false)}
              aria-label={claimable ? "Claim star" : undefined}
              tabIndex={claimable ? 0 : -1}
              aria-hidden={claimable ? undefined : true}
              disabled={!claimable}
            >
              <StarIcon state={cellState} isBonus={false} />
            </button>
          </td>
        );
      })}
    </tr>
  );
}

function BonusRow({
  child,
  days,
  kidsScreen,
  canClaim,
  isLatestClaim,
  onClaim,
}: {
  child: Child;
  days: DayDef[];
  kidsScreen: "active" | "paydayReady" | "closed";
  canClaim: boolean;
  isLatestClaim: (childId: ChildId, rowId: string, day: number, isBonus: boolean) => boolean;
  onClaim: (target: HTMLElement, childId: ChildId, rowId: string, day: number, isBonus: boolean) => void;
}) {
  return (
    <tr className="bonus-row">
      <td>
        <div className="chore-label">
          <span className="emoji">🌟</span>
          Bonus
        </div>
      </td>
      {child.bonus.map((cellState, dayIndex) => {
        const paydayCol = dayIndex === 6 ? "payday-col" : "";
        const claimable = canClaim && cellState === "pending" && kidsScreen === "active";
        const popClass = isLatestClaim(child.id, "bonus", dayIndex, true) ? " claim-pop" : "";

        return (
          <td key={`bonus-${days[dayIndex].key}`} className={paydayCol}>
            <button
              type="button"
              className={`star-cell ${cellState}${popClass}`}
              data-child-id={child.id}
              data-row-id="bonus"
              data-day={dayIndex}
              data-bonus="true"
              onClick={(event) => onClaim(event.currentTarget, child.id, "bonus", dayIndex, true)}
              aria-label={claimable ? "Claim bonus star" : undefined}
              tabIndex={claimable ? 0 : -1}
              aria-hidden={claimable ? undefined : true}
              disabled={!claimable}
            >
              <StarIcon state={cellState} isBonus={true} />
            </button>
          </td>
        );
      })}
    </tr>
  );
}

function BoardPanel({
  child,
  days,
  weekLabel,
  currentDay,
  paydayDay,
  kidsScreen,
  canClaim,
  isLatestClaim,
  onClaim,
  onAvatarTap,
  onBalanceTap,
  onGotoStore,
}: {
  child: Child;
  days: DayDef[];
  weekLabel: string;
  currentDay: number;
  paydayDay: number;
  kidsScreen: "active" | "paydayReady" | "closed";
  canClaim: boolean;
  isLatestClaim: (childId: ChildId, rowId: string, day: number, isBonus: boolean) => boolean;
  onClaim: (target: HTMLElement, childId: ChildId, rowId: string, day: number, isBonus: boolean) => void;
  onAvatarTap: (target: HTMLElement) => void;
  onBalanceTap: (target: HTMLButtonElement) => void;
  onGotoStore: (childId: ChildId) => void;
}) {
  const isPaydayReady = kidsScreen === "paydayReady";
  const isClosed = kidsScreen === "closed";
  const readonlyClass = isPaydayReady || isClosed ? " panel-readonly" : "";
  const closedClass = isClosed ? " panel-closed" : "";

  return (
    <article className={`child-panel${readonlyClass}${closedClass}`} data-child={child.id}>
      <header className="panel-header">
        <div className="child-id">
          <button
            type="button"
            className="avatar-tap-btn"
            onClick={(event) => onAvatarTap(event.currentTarget)}
            aria-label={`${child.name} avatar`}
          >
            <div className={`child-avatar ${child.id}`}>{child.avatar}</div>
          </button>
          <div>
            <div className={`child-name ${child.id}`}>{child.name}</div>
            <div className="child-age">Age {child.age}</div>
          </div>
        </div>
        <BalanceChip value={child.coins} onTap={onBalanceTap} ariaLabel={`${child.name} coins: ${child.coins}`} />
      </header>

      <div className="day-strip">
        <div className="day-strip-leading">
          <span className="week-range-chip" aria-label={`Week of ${weekLabel}`}>
            <svg className="icon icon-sm week-range-icon">
              <use href="#lucide-calendar"></use>
            </svg>
            <span>{weekLabel}</span>
          </span>
        </div>
        {days.map((day, dayIndex) => (
          <div
            key={day.key}
            className={`day-cell ${dayIndex === paydayDay ? "payday" : ""} ${dayIndex === currentDay ? "current" : ""}`}
          >
            <span className="day-label">{day.label}</span>
            {dayIndex === paydayDay ? (
              <span className="day-payday-tag">
                <span className="coin-icon">
                  <CoinUse width={11} height={11} />
                </span>
                payday
              </span>
            ) : null}
          </div>
        ))}
      </div>

      <table className="board-table" role="presentation">
        <tbody>
          {child.chores.map((chore) => (
            <BoardRow
              key={chore.id}
              child={child}
              chore={chore}
              days={days}
              kidsScreen={kidsScreen}
              canClaim={canClaim}
              isLatestClaim={isLatestClaim}
              onClaim={onClaim}
            />
          ))}
          <BonusRow
            child={child}
            days={days}
            kidsScreen={kidsScreen}
            canClaim={canClaim}
            isLatestClaim={isLatestClaim}
            onClaim={onClaim}
          />
        </tbody>
      </table>

      <footer className="panel-footer">
        <button type="button" className={`store-btn ${child.id}`} onClick={() => onGotoStore(child.id)}>
          <span>🏪</span> Reward Store
        </button>
      </footer>

      {isClosed ? (
        <div className="panel-complete-wrap" aria-hidden="true">
          <div className="panel-complete-badge">
            <span>🏆</span>
            <span>Payday Complete</span>
            <span>✅</span>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function CelebrationCard({ child, stars, interest, balance, showStars, showInterest }: {
  child: Child;
  stars: number;
  interest: number;
  balance: number;
  showStars: boolean;
  showInterest: boolean;
}) {
  return (
    <article className={`celebration-card ${child.id}`} data-celeb-card={child.id}>
      <header className="cc-head">
        <div className={`child-avatar ${child.id}`}>{child.avatar}</div>
        <div className={`cc-name ${child.id}`}>{child.name}</div>
      </header>

      <div className="stat-list">
        <div className={`stat-card ${showStars ? "show" : ""}`} data-stat="stars" data-child-id={child.id}>
          <div className="stat-label">Stars Earned</div>
          <div className="stat-value">
            <span data-count-stars={child.id}>{stars}</span> <span className="small">stars</span>
          </div>
        </div>

        <div className={`stat-card interest ${showInterest ? "show" : ""}`} data-stat="interest" data-child-id={child.id}>
          <div className="stat-label">Bonus Coins From Saving</div>
          <div className="stat-value interest">
            +<span data-count-interest={child.id}>{interest}</span> <span className="small">extra coins ✨</span>
          </div>
        </div>
      </div>

      <div className="coin-stage" data-coin-stage={child.id} aria-hidden="true">
        <div className="coin-stage-floor"></div>
      </div>

      <div className="balance-total">
        <div className="label">
          <span className="coin-icon">
            <CoinUse />
          </span>{" "}
          New Balance
        </div>
        <div className="value" data-count-balance={child.id}>
          {balance}
        </div>
        <div className="unit">coins</div>
      </div>
    </article>
  );
}

function RewardCard({
  childId,
  reward,
  affordable,
  canRedeem,
  need,
  delay,
  onOpen,
}: {
  childId: ChildId;
  reward: Reward;
  affordable: boolean;
  canRedeem: boolean;
  need: number;
  delay: number;
  onOpen: (childId: ChildId, rewardId: Reward["id"]) => void;
}) {
  const disabled = !affordable || !canRedeem;

  return (
    <button
      type="button"
      className={`reward-card ${disabled ? "disabled" : ""}`}
      onClick={() => onOpen(childId, reward.id)}
      style={{ animationDelay: `${delay}ms` }}
      disabled={disabled}
    >
      <div className="reward-emoji">{reward.icon}</div>
      <div className="name">{reward.name}</div>
      <RewardCostChip cost={reward.cost} affordable={affordable} />
      {!canRedeem ? <div className="need">Kid login required</div> : affordable ? null : <div className="need">Need {need} more</div>}
    </button>
  );
}

export function ChoreBoardApp({
  initialActor,
  initialMode,
  initialChildId,
  initialBoard,
  initialRewards,
}: {
  initialActor: ActorRole;
  initialMode: AppMode;
  initialChildId?: string;
  initialBoard?: LiveBoardPayload;
  initialRewards?: Reward[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const isNarrow = useMediaQuery("(max-width: 1080px)");
  // The server only renders demo mode when it is allowed; include initialMode so
  // local .env files cannot make the client disagree with that server decision.
  const demoModeAllowed = initialMode === "demo" || process.env.NODE_ENV !== "production";
  const [isDemoMode, setIsDemoMode] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return demoModeAllowed && new URLSearchParams(window.location.search).get("mode") === "demo";
    }
    return initialMode === "demo";
  });
  const [actorRole, setActorRole] = useState<ActorRole>(initialMode === "demo" ? "parent" : initialActor);
  const [bootReady, setBootReady] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminNotice, setAdminNotice] = useState<string | null>(null);
  const [isAdminLoading, setIsAdminLoading] = useState(false);
  const [showAdminLoadingToast, setShowAdminLoadingToast] = useState(false);
  const [adminChores, setAdminChores] = useState<AdminChoreItem[]>([]);
  const [adminRewards, setAdminRewards] = useState<AdminRewardItem[]>([]);
  const [isCreatingChild, setIsCreatingChild] = useState(false);
  const [isCreatingChore, setIsCreatingChore] = useState(false);
  const [isCreatingReward, setIsCreatingReward] = useState(false);
  const [pendingAssignmentKeys, setPendingAssignmentKeys] = useState<Set<string>>(new Set());
  const [savingChildId, setSavingChildId] = useState<string | null>(null);
  const [savingSharedChoreSlug, setSavingSharedChoreSlug] = useState<string | null>(null);
  const [savingRewardId, setSavingRewardId] = useState<string | null>(null);
  const [isSavingHouseholdSettings, setIsSavingHouseholdSettings] = useState(false);
  const [expandedChildId, setExpandedChildId] = useState<string>("primary");
  const [editingRewardId, setEditingRewardId] = useState<string | null>(null);
  const [isAddingReward, setIsAddingReward] = useState(false);
  const [isAddingChore, setIsAddingChore] = useState(false);
  const [isSavingChoreOrder, setIsSavingChoreOrder] = useState(false);
  const [isSavingRewardOrder, setIsSavingRewardOrder] = useState(false);
  const [draggingChoreSlug, setDraggingChoreSlug] = useState<string | null>(null);
  const [draggingRewardId, setDraggingRewardId] = useState<string | null>(null);
  const [choreDropTarget, setChoreDropTarget] = useState<{ slug: string; position: "before" | "after" } | null>(null);
  const [rewardDropTarget, setRewardDropTarget] = useState<{ id: string; position: "before" | "after" } | null>(null);
  const [savedFlashKeys, setSavedFlashKeys] = useState<Set<string>>(new Set());
  const [isResetConfirming, setIsResetConfirming] = useState(false);
  const [isStartingNewWeek, setIsStartingNewWeek] = useState(false);
  const [newChoreLabel, setNewChoreLabel] = useState("");
  const [newChoreIcon, setNewChoreIcon] = useState("✨");
  const [newRewardName, setNewRewardName] = useState("");
  const [newRewardIcon, setNewRewardIcon] = useState("🎁");
  const [newRewardCost, setNewRewardCost] = useState("10");
  const [newRewardDescription, setNewRewardDescription] = useState("");
  const [interestRateDraft, setInterestRateDraft] = useState("5");
  const [paydayDayDraft, setPaydayDayDraft] = useState("6");
  const [sharedKidPinDraft, setSharedKidPinDraft] = useState("");
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("children");
  const [perfStats, setPerfStats] = useState<Record<PerfBucket, { count: number; lastMs: number; p95Ms: number }>>({
    settingsLoad: { count: 0, lastMs: 0, p95Ms: 0 },
    mutation: { count: 0, lastMs: 0, p95Ms: 0 },
    reorder: { count: 0, lastMs: 0, p95Ms: 0 },
    transition: { count: 0, lastMs: 0, p95Ms: 0 },
  });
  const hasBootstrapped = useRef(false);
  const perfSamplesRef = useRef<Record<PerfBucket, number[]>>({
    settingsLoad: [],
    mutation: [],
    reorder: [],
    transition: [],
  });
  const pendingRouteNavigationStartRef = useRef<number | null>(null);
  const handleAuthError = useCallback(() => {
    router.replace("/auth");
  }, [router]);
  const {
    state,
    days,
    rewards,
    apiError,
    fallingCoins,
    selectedAwardRowState,
    getStarCounts,
    formatRelativeTime,
    runCelebrationSequence,
    isLatestClaim,
    refreshLiveBoard,
    refreshLiveRewards,
    actions,
  } = useChoreBoardApp({
    liveApi: !isDemoMode,
    onAuthError: handleAuthError,
  });

  const {
    setView,
    switchKid,
    switchStoreKid,
    gotoStore,
    gotoKids,
    seePayday,
    closePayday,
    claimStar,
    openRedeem,
    closeModal,
    confirmRedeem,
    parentGo,
    parentSelectChild,
    parentSelectChore,
    parentSelectDay,
    awardSelected,
    undoAward,
    runPayday,
    setQueueTab,
    fulfillRedemption,
    archiveRedemption,
    toggleSounds,
    toggleAnimations,
    soundCoinTap,
    soundStoreDoorChime,
    replaceState,
    replaceRewards,
    applyLiveBoard,
    clearApiError,
  } = actions;

  const rewardById = useMemo(() => {
    const map = new Map<string, Reward>();
    rewards.forEach((reward) => {
      map.set(reward.id, reward);
    });
    return map;
  }, [rewards]);

  const childById = useMemo(() => {
    const map = new Map<string, Child>();
    state.children.forEach((child) => {
      map.set(child.id, child);
    });
    return map;
  }, [state.children]);

  const appThemeVars = useMemo(() => {
    const vars: Record<string, string> = {};
    const primary = state.children.find((child) => child.id === "primary");
    const secondary = state.children.find((child) => child.id === "secondary");
    const primaryPalette = generateChildPalette(primary?.accent, "primary");
    const secondaryPalette = generateChildPalette(secondary?.accent, "secondary");

    vars["--primary-600"] = primaryPalette[600];
    vars["--primary-500"] = primaryPalette[500];
    vars["--primary-400"] = primaryPalette[400];
    vars["--primary-blue"] = primaryPalette[400];
    vars["--primary-300"] = primaryPalette[300];
    vars["--primary-200"] = primaryPalette[200];
    vars["--primary-100"] = primaryPalette[100];

    vars["--secondary-600"] = secondaryPalette[600];
    vars["--secondary-500"] = secondaryPalette[500];
    vars["--secondary-400"] = secondaryPalette[400];
    vars["--secondary-300"] = secondaryPalette[300];
    vars["--secondary-200"] = secondaryPalette[200];
    vars["--secondary-100"] = secondaryPalette[100];

    return vars as CSSProperties;
  }, [state.children]);

  const visibleKids = useMemo(
    () => (isNarrow ? state.children.filter((child) => child.id === state.narrowChildId) : state.children),
    [isNarrow, state.children, state.narrowChildId],
  );

  const visibleStoreKids = useMemo(
    () => (isNarrow ? state.children.filter((child) => child.id === state.storeNarrowChildId) : state.children),
    [isNarrow, state.children, state.storeNarrowChildId],
  );

  const pendingRedemptions = useMemo(
    () => state.redemptions.filter((entry) => entry.status === "pending"),
    [state.redemptions],
  );

  const fulfilledRedemptions = useMemo(
    () => state.redemptions.filter((entry) => entry.status === "fulfilled"),
    [state.redemptions],
  );

  useEffect(() => {
    document.body.classList.toggle("reduce-motion", !state.settings.animations);
    return () => {
      document.body.classList.remove("reduce-motion");
    };
  }, [state.settings.animations]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncFromLocation = () => {
      const demoRequested = new URLSearchParams(window.location.search).get("mode") === "demo";
      setIsDemoMode(demoModeAllowed && demoRequested);
    };

    syncFromLocation();
    window.addEventListener("popstate", syncFromLocation);
    return () => {
      window.removeEventListener("popstate", syncFromLocation);
    };
  }, [demoModeAllowed]);

  useEffect(() => {
    if (hasBootstrapped.current) return;
    hasBootstrapped.current = true;

    let cancelled = false;
    setBootError(null);
    const targetRoute = getRouteTarget(window.location.pathname);
    const withMode = (path: string) => (isDemoMode ? `${path}?mode=demo` : path);

    const boot = async () => {
      if (isDemoMode) {
        const demoState = createInitialState();
        if (initialChildId) {
          demoState.narrowChildId = initialChildId;
          demoState.storeNarrowChildId = initialChildId;
          demoState.parentSelectedChildId = initialChildId;
        }
        replaceState(demoState);
        replaceRewards(REWARDS);
        setActorRole("parent");
        if (targetRoute?.view === "kids") {
          setView("kids");
        } else if (targetRoute?.view === "store") {
          setView("store");
        } else if (targetRoute?.view === "parent") {
          if (targetRoute.parentScreen === "settings") {
            setSettingsSection(targetRoute.settingsSection ?? "children");
          }
          parentGo(targetRoute.parentScreen ?? "home");
        }
        if (!cancelled) {
          setBootReady(true);
        }
        return;
      }

      try {
        if (cancelled) return;
        setActorRole(initialActor);

        if (initialActor === "kid" && initialChildId) {
          const kidView = targetRoute?.view === "store" ? "store" : "kids";
          setView(kidView);
          switchKid(initialChildId);
          switchStoreKid(initialChildId);
          if (targetRoute?.view === "parent") {
            router.replace(withMode("/kids"));
          }
        } else if (initialActor === "parent") {
          if (targetRoute?.view === "kids" || targetRoute?.view === "store") {
            setView(targetRoute.view);
          } else if (targetRoute?.view === "parent") {
            if (targetRoute.parentScreen === "settings") {
              setSettingsSection(targetRoute.settingsSection ?? "children");
            }
            parentGo(targetRoute.parentScreen ?? "home");
          } else {
            parentGo("home");
          }
        }

        if (!initialBoard || !initialRewards) {
          throw new Error("Unable to load board data.");
        }
        applyLiveBoard(initialBoard);
        replaceRewards(initialRewards);
      } catch (error) {
        if (cancelled) return;
        if (error instanceof Error) {
          setBootError(error.message);
        } else {
          setBootError("Unable to load board data.");
        }
      } finally {
        if (!cancelled) {
          setBootReady(true);
        }
      }
    };

    void boot();

    return () => {
      cancelled = true;
    };
  }, [
    initialChildId,
    isDemoMode,
    parentGo,
    applyLiveBoard,
    initialActor,
    initialBoard,
    initialRewards,
    replaceRewards,
    replaceState,
    router,
    setView,
    switchKid,
    switchStoreKid,
  ]);

  useEffect(() => {
    if (actorRole === "kid" && state.view === "parent") {
      setView("kids");
    }
  }, [actorRole, setView, state.view]);

  useEffect(() => {
    if (state.view === "kids" && state.kidsScreen === "celebration") {
      runCelebrationSequence();
    }
  }, [runCelebrationSequence, state.kidsScreen, state.view]);

  useEffect(() => {
    if (state.view !== "parent" || state.parentScreen !== "award") return;

    const selectedChild = childById.get(state.parentSelectedChildId);
    if (!selectedChild) return;

    const choreExists = selectedChild.chores.some((chore) => chore.id === state.parentSelectedChoreId);
    if (choreExists) return;

    const nextChoreId = selectedChild.chores[0]?.id;
    if (nextChoreId) {
      parentSelectChore(nextChoreId);
    }
  }, [
    childById,
    parentSelectChore,
    state.parentScreen,
    state.parentSelectedChildId,
    state.parentSelectedChoreId,
    state.view,
  ]);

  const selectedAwardChild = childById.get(state.parentSelectedChildId);
  const selectedDay = days[state.parentSelectedDay];
  const isFutureDay = state.parentSelectedDay > state.currentDay;
  const rowAwarded = selectedAwardRowState === "pending" || selectedAwardRowState === "claimed";
  const bonusState = selectedAwardChild?.bonus[state.parentSelectedDay] ?? "empty";
  const bonusAwarded = bonusState === "pending" || bonusState === "claimed";

  const disableAward = rowAwarded || isFutureDay;
  const disableBonusAward = bonusAwarded || isFutureDay;

  const activeQueue = state.queueTab === "pending" ? pendingRedemptions : fulfilledRedemptions;
  const pendingRedemptionCount = pendingRedemptions.length;
  const fulfilledRedemptionCount = fulfilledRedemptions.length;

  const canClaimStars = isDemoMode || actorRole === "kid";
  const canRequestRedemption = isDemoMode || actorRole === "kid";
  const canAccessParent = isDemoMode || actorRole === "parent";
  const weekRangeLabel = useMemo(() => formatWeekRangeLabel(state.currentWeekStart), [state.currentWeekStart]);
  const paydayDateLabel = useMemo(
    () => formatPaydayLabel(state.currentWeekStart, state.paydayDay),
    [state.currentWeekStart, state.paydayDay],
  );
  const dayDates = useMemo(() => {
    const start = new Date(state.currentWeekStart);
    if (Number.isNaN(start.getTime())) {
      return days.map((day) => day.date);
    }
    return days.map((_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date.getDate();
    });
  }, [days, state.currentWeekStart]);
  const routeTarget = useMemo(() => getRouteTarget(pathname), [pathname]);

  const withModeQuery = useCallback(
    (path: string) => (isDemoMode ? `${path}?mode=demo` : path),
    [isDemoMode],
  );

  const pushRoute = useCallback(
    (path: string) => {
      if (typeof window === "undefined") return;
      const nextUrl = withModeQuery(path);
      const currentUrl = `${window.location.pathname}${window.location.search}`;
      if (currentUrl === nextUrl) return;
      pendingRouteNavigationStartRef.current = performance.now();
      window.history.pushState({ path }, "", nextUrl);
    },
    [withModeQuery],
  );

  const spinAvatar = useCallback((target: HTMLElement) => {
    const avatar = target.querySelector<HTMLElement>(".child-avatar");
    if (!avatar) return;

    avatar.classList.remove("is-spinning");
    void avatar.offsetWidth;
    avatar.classList.add("is-spinning");

    window.setTimeout(() => {
      avatar.classList.remove("is-spinning");
    }, 760);
  }, []);

  const handleCoinBalanceTap = useCallback((target: HTMLButtonElement) => {
    const coin = target.querySelector<HTMLElement>(".coin-icon");
    if (coin) {
      coin.classList.remove("is-spinning");
      void coin.offsetWidth;
      coin.classList.add("is-spinning");
      window.setTimeout(() => {
        coin.classList.remove("is-spinning");
      }, 760);
    }
    soundCoinTap();
  }, [soundCoinTap]);

  const navigateKids = useCallback(() => {
    gotoKids();
    pushRoute("/kids");
  }, [gotoKids, pushRoute]);

  const navigateStore = useCallback(
    (childId?: ChildId) => {
      soundStoreDoorChime();
      gotoStore(childId);
      pushRoute("/store");
    },
    [gotoStore, pushRoute, soundStoreDoorChime],
  );

  const navigateParent = useCallback(
    (screen: AppState["parentScreen"] = "home", section?: SettingsSection) => {
      parentGo(screen);
      if (screen === "settings") {
        const nextSection = section ?? settingsSection;
        setSettingsSection(nextSection);
        pushRoute(getPathForParentScreen(screen, nextSection));
        return;
      }
      pushRoute(getPathForParentScreen(screen, settingsSection));
    },
    [parentGo, pushRoute, settingsSection],
  );

  const navigateSettingsSection = useCallback(
    (section: SettingsSection) => {
      navigateParent("settings", section);
    },
    [navigateParent],
  );

  useEffect(() => {
    if (!bootReady || !routeTarget) return;

    if (!canAccessParent && routeTarget.view === "parent") {
      if (typeof window !== "undefined") {
        window.history.replaceState({}, "", withModeQuery("/kids"));
      }
      setView("kids");
      return;
    }

    if (routeTarget.view === "kids") {
      setView("kids");
      return;
    }

    if (routeTarget.view === "store") {
      setView("store");
      return;
    }

    if (routeTarget.view === "parent") {
      if (routeTarget.parentScreen === "settings") {
        setSettingsSection(routeTarget.settingsSection ?? "children");
      }
      parentGo(routeTarget.parentScreen ?? "home");
    }
  }, [bootReady, canAccessParent, parentGo, routeTarget, setView, withModeQuery]);

  useEffect(() => {
    const syncFromLocation = () => {
      if (typeof window === "undefined") return;
      const target = getRouteTarget(window.location.pathname);
      if (!target) return;

      if (!canAccessParent && target.view === "parent") {
        window.history.replaceState({}, "", withModeQuery("/kids"));
        setView("kids");
        return;
      }

      if (target.view === "kids") {
        setView("kids");
        return;
      }

      if (target.view === "store") {
        setView("store");
        return;
      }

      if (target.parentScreen === "settings") {
        setSettingsSection(target.settingsSection ?? "children");
      }
      parentGo(target.parentScreen ?? "home");
    };

    window.addEventListener("popstate", syncFromLocation);
    return () => {
      window.removeEventListener("popstate", syncFromLocation);
    };
  }, [canAccessParent, parentGo, setView, withModeQuery]);

  useEffect(() => {
    if (!adminNotice) return;
    const id = window.setTimeout(() => setAdminNotice(null), 2600);
    return () => {
      window.clearTimeout(id);
    };
  }, [adminNotice]);

  useEffect(() => {
    if (!(state.view === "parent" && state.parentScreen === "settings")) {
      setShowAdminLoadingToast(false);
      return;
    }

    if (!isAdminLoading) {
      setShowAdminLoadingToast(false);
      return;
    }

    const id = window.setTimeout(() => setShowAdminLoadingToast(true), 180);
    return () => {
      window.clearTimeout(id);
    };
  }, [isAdminLoading, state.parentScreen, state.view]);

  const flashSaved = useCallback((key: string) => {
    setSavedFlashKeys((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });

    window.setTimeout(() => {
      setSavedFlashKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }, 820);
  }, []);

  const recordPerfSample = useCallback((bucket: PerfBucket, durationMs: number) => {
    const clamped = Math.max(0, Math.round(durationMs));
    const samples = perfSamplesRef.current[bucket] ?? [];
    const nextSamples = [...samples, clamped].slice(-40);
    perfSamplesRef.current[bucket] = nextSamples;

    setPerfStats((prev) => ({
      ...prev,
      [bucket]: {
        count: prev[bucket].count + 1,
        lastMs: clamped,
        p95Ms: calculateP95(nextSamples),
      },
    }));
  }, []);

  const timedFetch = useCallback(
    async (bucket: PerfBucket, input: RequestInfo | URL, init?: RequestInit) => {
      const startedAt = performance.now();
      const response = await fetch(input, init);
      recordPerfSample(bucket, performance.now() - startedAt);
      return response;
    },
    [recordPerfSample],
  );

  useEffect(() => {
    const startedAt = pendingRouteNavigationStartRef.current;
    if (startedAt == null) return;
    recordPerfSample("transition", performance.now() - startedAt);
    pendingRouteNavigationStartRef.current = null;
  }, [recordPerfSample, routeTarget]);

  useEffect(() => {
    setExpandedChildId((prev) => {
      if (state.children.some((child) => child.id === prev)) return prev;
      return state.children[0]?.id ?? prev;
    });
  }, [state.children]);

  useEffect(() => {
    setInterestRateDraft(String(state.interestRate));
    setPaydayDayDraft(String(state.paydayDay));
  }, [state.interestRate, state.paydayDay]);

  const loadAdminData = useCallback(async () => {
    if (!canAccessParent) return;

    if (isDemoMode) return;

    setIsAdminLoading(true);
    setAdminError(null);
    try {
      const response = await timedFetch("settingsLoad", "/api/admin/bootstrap", { cache: "no-store" });

      if (response.status === 401) {
        router.replace("/auth");
        return;
      }

      if (!response.ok) {
        throw new Error("Unable to load admin settings.");
      }

      const payload = (await response.json()) as { chores?: AdminChoreItem[]; rewards?: AdminRewardItem[] };

      setAdminChores(payload.chores ?? []);
      setAdminRewards(payload.rewards ?? []);
    } catch (error) {
      if (error instanceof Error) {
        setAdminError(error.message);
      } else {
        setAdminError("Unable to load admin settings.");
      }
    } finally {
      setIsAdminLoading(false);
    }
  }, [canAccessParent, isDemoMode, router, timedFetch]);

  useEffect(() => {
    if (!isDemoMode) return;
    if (!(state.view === "parent" && state.parentScreen === "settings" && canAccessParent)) return;

    const demoChores = state.children.flatMap((child) =>
      child.chores.map((chore, index) => ({
        id: `${child.id}-${chore.id}`,
        childId: child.id,
        slug: chore.id,
        label: chore.label,
        icon: chore.icon,
        sortOrder: index,
        active: true,
      })),
    );
    setAdminChores(demoChores);
    setAdminRewards(
      rewards.map((reward, index) => ({
        id: reward.id,
        slug: reward.id,
        name: reward.name,
        icon: reward.icon,
        description: reward.desc,
        cost: reward.cost,
        sortOrder: index,
        active: true,
      })),
    );
  }, [canAccessParent, isDemoMode, rewards, state.children, state.parentScreen, state.view]);

  useEffect(() => {
    if (state.view === "parent" && state.parentScreen === "settings" && canAccessParent) {
      void loadAdminData();
    }
  }, [canAccessParent, loadAdminData, state.parentScreen, state.view]);

  const refreshAfterAdminMutation = useCallback(
    async ({ board = true, rewards: shouldRefreshRewards = false, adminData = false }: { board?: boolean; rewards?: boolean; adminData?: boolean } = {}) => {
      const tasks: Array<Promise<void>> = [];
      if (board) tasks.push(refreshLiveBoard());
      if (shouldRefreshRewards) tasks.push(refreshLiveRewards());
      if (adminData) tasks.push(loadAdminData());
      if (tasks.length > 0) {
        await Promise.all(tasks);
      }
    },
    [loadAdminData, refreshLiveBoard, refreshLiveRewards],
  );

  const updateChildDraft = (childId: string, patch: Partial<Pick<Child, "name" | "age" | "avatar" | "accent">>) => {
    const nextState = structuredClone(state) as AppState;
    const child = nextState.children.find((entry) => entry.id === childId);
    if (!child) return;
    Object.assign(child, patch);
    replaceState(nextState);
  };

  const saveChildProfile = async (childId: string) => {
    const child = childById.get(childId);
    if (!child || isDemoMode) return;

    try {
      setSavingChildId(childId);
      setAdminError(null);
      const response = await timedFetch("mutation", `/api/admin/children/${encodeURIComponent(childId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: child.name,
          age: child.age,
          avatar: child.avatar,
          accent: child.accent,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string; state?: LiveBoardPayload };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to save child settings.");
      }

      if (payload.state) applyLiveBoard(payload.state);
      setAdminNotice("Child settings updated.");
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : "Unable to save child settings.");
    } finally {
      setSavingChildId((current) => (current === childId ? null : current));
    }
  };

  const createChild = async () => {
    if (isDemoMode || isCreatingChild) return;

    try {
      setIsCreatingChild(true);
      setAdminError(null);
      const nextIndex = state.children.length + 1;
      const response = await timedFetch("mutation", "/api/admin/children", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: `Child ${nextIndex}`,
          age: 6,
          avatar: "🙂",
          accent: "#4A8BB5",
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string; state?: LiveBoardPayload };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to add child.");
      }

      if (payload.state) applyLiveBoard(payload.state);
      setAdminNotice("Child added.");
      const latestChild = payload.state?.children?.at(-1);
      if (latestChild?.id) {
        setExpandedChildId(latestChild.id);
      }
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : "Unable to add child.");
    } finally {
      setIsCreatingChild(false);
    }
  };

  const removeChild = async (childId: string) => {
    if (isDemoMode) return;

    try {
      setAdminError(null);
      const response = await timedFetch("mutation", `/api/admin/children/${encodeURIComponent(childId)}`, {
        method: "DELETE",
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string; state?: LiveBoardPayload };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to delete child.");
      }

      if (payload.state) {
        applyLiveBoard(payload.state);
        setAdminChores((prev) => prev.filter((chore) => chore.childId !== childId));
      }
      setAdminNotice("Child deleted.");
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : "Unable to delete child.");
    }
  };

  const saveHouseholdSettings = async (options?: { silent?: boolean; interestRate?: number; paydayDay?: number; sharedKidPin?: string }) => {
    if (isDemoMode) return false;
    if (isSavingHouseholdSettings) return false;
    const parsedInterest = typeof options?.interestRate === "number" ? options.interestRate : Number(interestRateDraft);
    const parsedPayday = typeof options?.paydayDay === "number" ? options.paydayDay : Number(paydayDayDraft);
    const sharedKidPin = typeof options?.sharedKidPin === "string" ? options.sharedKidPin.trim() : "";

    if (!Number.isFinite(parsedInterest) || parsedInterest < 0 || parsedInterest > 100) {
      setAdminError("Interest rate must be between 0 and 100.");
      return false;
    }

    if (!Number.isFinite(parsedPayday) || parsedPayday < 0 || parsedPayday > 6) {
      setAdminError("Payday day must be between Saturday (0) and Friday (6).");
      return false;
    }

    if (sharedKidPin && !/^[0-9]{4,12}$/.test(sharedKidPin)) {
      setAdminError("Kids PIN must be 4-12 digits.");
      return false;
    }

    try {
      setIsSavingHouseholdSettings(true);
      setAdminError(null);
      const response = await timedFetch("mutation", "/api/admin/household-settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          interestRate: Math.round(parsedInterest),
          paydayDay: Math.round(parsedPayday),
          ...(sharedKidPin ? { sharedKidPin } : {}),
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string; state?: LiveBoardPayload };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to save household settings.");
      }

      const nextState = structuredClone(state) as AppState;
      nextState.interestRate = Math.round(parsedInterest);
      nextState.paydayDay = Math.round(parsedPayday);
      replaceState(nextState);
      if (sharedKidPin) {
        setSharedKidPinDraft("");
      }
      if (payload.state) applyLiveBoard(payload.state);
      if (!options?.silent) {
        setAdminNotice("Household settings saved.");
      }
      return true;
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : "Unable to save household settings.");
      return false;
    } finally {
      setIsSavingHouseholdSettings(false);
    }
  };

  const createChore = async () => {
    if (isDemoMode || isCreatingChore) return false;
    if (!newChoreLabel.trim() || !newChoreIcon.trim()) return false;

    try {
      setIsCreatingChore(true);
      setAdminError(null);
      const response = await timedFetch("mutation", "/api/admin/chores/shared", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label: newChoreLabel.trim(), icon: newChoreIcon.trim() }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; chores?: AdminChoreItem[]; state?: LiveBoardPayload };
      if (!response.ok) throw new Error(payload.error ?? "Unable to create chore.");
      setAdminChores(payload.chores ?? []);
      setNewChoreLabel("");
      setNewChoreIcon("✨");
      setIsAddingChore(false);
      if (payload.state) applyLiveBoard(payload.state);
      setAdminNotice("Chore created.");
      return true;
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : "Unable to create chore.");
      return false;
    } finally {
      setIsCreatingChore(false);
    }
  };

  const updateChore = async (
    choreId: string,
    patch: Partial<Pick<AdminChoreItem, "label" | "icon" | "active" | "sortOrder">>,
    options?: { silent?: boolean; skipRefresh?: boolean; applyServerState?: boolean },
  ) => {
    if (isDemoMode) return;

    try {
      setAdminError(null);
      const response = await timedFetch("mutation", "/api/admin/chores", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          choreId,
          ...patch,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string; chores?: AdminChoreItem[] };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to update chore.");
      }

      if (options?.applyServerState !== false) {
        setAdminChores(payload.chores ?? []);
      }
      if (!options?.skipRefresh) {
        await refreshLiveBoard();
      }
      if (!options?.silent) {
        setAdminNotice("Chore updated.");
      }
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : "Unable to update chore.");
    }
  };

  const createReward = async () => {
    if (isDemoMode || isCreatingReward) return false;
    if (!newRewardName.trim() || !newRewardIcon.trim() || !newRewardDescription.trim()) return false;
    const parsedCost = Number(newRewardCost);
    if (!Number.isFinite(parsedCost) || parsedCost <= 0) return false;

    try {
      setIsCreatingReward(true);
      setAdminError(null);
      const response = await timedFetch("mutation", "/api/admin/rewards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: newRewardName.trim(),
          icon: newRewardIcon.trim(),
          description: newRewardDescription.trim(),
          cost: Math.round(parsedCost),
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string; rewards?: AdminRewardItem[] };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to create reward.");
      }

      setAdminRewards(payload.rewards ?? []);
      setNewRewardName("");
      setNewRewardIcon("🎁");
      setNewRewardCost("10");
      setNewRewardDescription("");
      await refreshLiveRewards();
      setAdminNotice("Reward created.");
      return true;
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : "Unable to create reward.");
      return false;
    } finally {
      setIsCreatingReward(false);
    }
  };

  const updateReward = async (
    rewardId: string,
    patch: Partial<Pick<AdminRewardItem, "name" | "icon" | "description" | "cost" | "active" | "sortOrder">>,
    options?: { silent?: boolean; skipRefresh?: boolean; applyServerState?: boolean },
  ) => {
    if (isDemoMode) return;

    try {
      setAdminError(null);
      const response = await timedFetch("mutation", "/api/admin/rewards", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          rewardId,
          ...patch,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string; rewards?: AdminRewardItem[] };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to update reward.");
      }

      if (options?.applyServerState !== false) {
        setAdminRewards(payload.rewards ?? []);
      }
      if (!options?.skipRefresh) {
        await refreshLiveRewards();
      }
      if (!options?.silent) {
        setAdminNotice("Reward updated.");
      }
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : "Unable to update reward.");
    }
  };

  const deleteReward = async (rewardId: string, options?: { silent?: boolean; skipRefresh?: boolean }) => {
    if (isDemoMode) return;

    try {
      setAdminError(null);
      const response = await timedFetch("mutation", "/api/admin/rewards", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rewardId }),
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string; rewards?: AdminRewardItem[] };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to delete reward.");
      }

      setAdminRewards(payload.rewards ?? []);
      if (!options?.skipRefresh) {
        await refreshLiveRewards();
      }
      if (!options?.silent) {
        setAdminNotice("Reward deleted.");
      }
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : "Unable to delete reward.");
    }
  };

  const resetHousehold = async () => {
    if (isDemoMode) return;
    if (!isResetConfirming) {
      setIsResetConfirming(true);
      return;
    }

    try {
      setAdminError(null);
      const response = await timedFetch("mutation", "/api/admin/household/reset", {
        method: "POST",
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to reset household.");
      }

      await refreshAfterAdminMutation({ board: true });
      setAdminNotice("Household reset complete.");
      setIsResetConfirming(false);
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : "Unable to reset household.");
      setIsResetConfirming(false);
    }
  };

  const startNewWeek = async () => {
    if (isDemoMode || isStartingNewWeek) return;

    try {
      setIsStartingNewWeek(true);
      setAdminError(null);
      const response = await timedFetch("mutation", "/api/payday/new-week", {
        method: "POST",
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to start a new week.");
      }

      await refreshAfterAdminMutation({ board: true });
      setAdminNotice("New week started.");
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : "Unable to start a new week.");
    } finally {
      setIsStartingNewWeek(false);
    }
  };

  const logout = async () => {
    try {
      await fetch("/api/auth/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
    } finally {
      router.replace("/auth");
      router.refresh();
    }
  };

  const renderKidsView = () => {
    if (state.kidsScreen === "celebration") {
      return (
        <section className="kids-screen">
          <div className="celebration">
            <div className="falling-coins" aria-hidden="true">
              {fallingCoins.map((coin) => (
                <span
                  key={coin.id}
                  className={`coin-fall ${coin.depthClass}`}
                  style={{
                    left: `${coin.left}%`,
                    ["--drift" as string]: `${coin.drift}px`,
                    ["--scale" as string]: coin.scale,
                    animationDuration: `${coin.duration}s`,
                    animationDelay: `-${coin.delay}s`,
                  }}
                >
                  <svg viewBox="0 0 24 24">
                    <use href="#coin"></use>
                  </svg>
                </span>
              ))}
            </div>

            <div className="celebration-inner">
              <div className="celebration-title">🎉 Payday! 🎉</div>
              <div className="celebration-subtitle">Here&apos;s what your stars turned into</div>

              <div className="celebration-grid">
                {state.children.map((child) => {
                  const visual = state.celebrationVisuals[child.id];
                  return (
                    <CelebrationCard
                      key={child.id}
                      child={child}
                      stars={visual.stars}
                      interest={visual.interest}
                      balance={visual.balance}
                      showStars={visual.showStars}
                      showInterest={visual.showInterest}
                    />
                  );
                })}
              </div>

              <div className="celebration-action">
                <button type="button" className="done-btn" onClick={closePayday}>
                  Done
                </button>
              </div>
            </div>
          </div>
        </section>
      );
    }

    const boardScreen: "active" | "paydayReady" | "closed" = state.kidsScreen;

    return (
      <section className="kids-screen">
        {!canClaimStars ? (
          <div className="kids-readonly-note">
            <span>Read-only in parent mode. Sign in as kid to claim stars.</span>
            <button type="button" className="kids-readonly-link" onClick={() => navigateParent("home")}>
              Go to Parent Home
            </button>
          </div>
        ) : null}
        {isNarrow ? (
          <div className="child-selector switcher-wrap">
            {state.children.map((child) => (
              <button
                key={`switch-kid-${child.id}`}
                type="button"
                className={`child-pill ${state.narrowChildId === child.id ? `active-${child.id}` : ""}`}
                onClick={() => switchKid(child.id)}
              >
                <span>{child.avatar}</span>
                <span>{child.name}</span>
              </button>
            ))}
          </div>
        ) : null}

        <div className={`board-grid ${state.kidsScreen === "paydayReady" ? "payday-ready" : ""}`}>
          {visibleKids.map((child) => (
            <BoardPanel
              key={`board-${child.id}`}
              child={child}
              days={days}
              weekLabel={weekRangeLabel}
              currentDay={state.currentDay}
              paydayDay={state.paydayDay}
              kidsScreen={boardScreen}
              canClaim={canClaimStars}
              isLatestClaim={isLatestClaim}
              onClaim={claimStar}
              onAvatarTap={spinAvatar}
              onBalanceTap={handleCoinBalanceTap}
              onGotoStore={navigateStore}
            />
          ))}
        </div>

        {state.kidsScreen === "paydayReady" ? (
          <div className="see-payday-wrap">
            <button className="see-payday" type="button" onClick={seePayday}>
              <span className="coin-icon">
                <CoinUse />
              </span>
              See Payday!
            </button>
          </div>
        ) : null}
      </section>
    );
  };

  const renderStoreView = () => (
    <section className="reward-store-screen">
      {isNarrow ? (
        <div className="child-selector switcher-wrap">
          {state.children.map((child) => (
            <button
              key={`switch-store-kid-${child.id}`}
              type="button"
              className={`child-pill ${state.storeNarrowChildId === child.id ? `active-${child.id}` : ""}`}
              onClick={() => switchStoreKid(child.id)}
            >
              <span>{child.avatar}</span>
              <span>{child.name}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="store-grid">
        {visibleStoreKids.map((child, index) => (
          <article key={`store-${child.id}`} className={`store-panel ${child.id}`}>
            <header className="panel-header store-header">
              <div className="child-id">
                <button
                  type="button"
                  className="avatar-tap-btn"
                  onClick={(event) => spinAvatar(event.currentTarget)}
                  aria-label={`${child.name} avatar`}
                >
                  <div className={`child-avatar ${child.id}`}>{child.avatar}</div>
                </button>
                <div>
                  <div className={`child-name ${child.id}`}>{child.name}</div>
                  <div className="store-title">Reward Store</div>
                </div>
              </div>
              <BalanceChip value={child.coins} />
            </header>

            <div className="reward-grid">
              {rewards.map((reward, rewardIndex) => {
                const affordable = child.coins >= reward.cost;
                const delay = index * 60 + rewardIndex * 70;

                return (
                  <RewardCard
                    key={`${child.id}-${reward.id}`}
                    childId={child.id}
                    reward={reward}
                    affordable={affordable}
                    canRedeem={canRequestRedemption}
                    need={reward.cost - child.coins}
                    delay={delay}
                    onOpen={openRedeem}
                  />
                );
              })}
            </div>

            <button type="button" className="back-btn" onClick={navigateKids}>
              ← Back to Board
            </button>
          </article>
        ))}
      </div>
    </section>
  );

  const renderParentHome = () => (
    <article className="phone-frame">
      <div className="home-header">
        <div className="home-title">Chore Board</div>
        <button
          type="button"
          className="home-settings-btn"
          onClick={() => navigateParent("settings")}
          aria-label="Open settings"
        >
          ⚙️
        </button>
      </div>

      <div className="p-body">
        {state.showPaydayCTAHome ? (
          <button type="button" className="home-payday-cta" onClick={() => navigateParent("payday")}>
            <span className="coin-icon">
              <CoinUse />
            </span>
            <span>
              <span className="hpc-title">It&apos;s Payday!</span>
              <span className="hpc-sub">Review &amp; convert stars to coins</span>
            </span>
            <span className="hpc-arrow">›</span>
          </button>
        ) : null}

        <section className="home-status">
          {state.children.map((child) => {
            const stars = getStarCounts(child);
            const palette = generateChildPalette(child.accent, child.id);
            const statusCardStyle = {
              "--status-card-bg": palette[100],
              "--status-avatar-bg": palette[200],
            } as CSSProperties;
            return (
              <div key={`status-${child.id}`} className={`status-card ${child.id}`} style={statusCardStyle}>
                <div className="sc-top">
                  <div className="sc-avatar">{child.avatar}</div>
                  <div className="sc-name">{child.name}</div>
                </div>
                <div className="sc-stars">
                  {stars.total} / {child.chores.length * 7} stars this week
                </div>
                <div className="sc-balance">
                  <span className="coin-icon">
                    <CoinUse />
                  </span>{" "}
                  {child.coins} coins
                </div>
              </div>
            );
          })}
        </section>

        <div className="nav-group-label">Actions</div>
        <button type="button" className="nav-item" onClick={() => navigateParent("award")}>
          <div className="ni-icon ni-icon-award">⭐</div>
          <div className="ni-info">
            <div className="ni-title">Award Star</div>
            <div className="ni-desc">Tap child, chore, and day</div>
          </div>
          <span className="ni-chevron">›</span>
        </button>

        <button type="button" className="nav-item" onClick={() => navigateParent("payday")}>
          <div className="ni-icon ni-icon-payday">
            <span className="coin-icon">
              <CoinUse />
            </span>
          </div>
          <div className="ni-info">
            <div className="ni-title">Run Payday</div>
            <div className="ni-desc">Convert stars to coins</div>
          </div>
          <span className="ni-chevron">›</span>
        </button>

        <button type="button" className="nav-item" onClick={() => navigateParent("redemptions")}>
          <div className="ni-icon ni-icon-redemptions">🎁</div>
          <div className="ni-info">
            <div className="ni-title">Redemptions</div>
            <div className="ni-desc">Rewards to fulfill</div>
          </div>
          <div
            className="ni-badge-dual"
            aria-label={`${pendingRedemptionCount} pending, ${fulfilledRedemptionCount} fulfilled`}
            title={`Pending ${pendingRedemptionCount} · Fulfilled ${fulfilledRedemptionCount}`}
          >
            <span className="ni-badge-count pending">{pendingRedemptionCount}</span>
            <span className="ni-badge-divider">/</span>
            <span className="ni-badge-count fulfilled">{fulfilledRedemptionCount}</span>
          </div>
          <span className="ni-chevron">›</span>
        </button>

        <div className="nav-group-label">View</div>
        <button type="button" className="nav-item" onClick={navigateKids}>
          <div className="ni-icon ni-icon-board">📋</div>
          <div className="ni-info">
            <div className="ni-title">View Board</div>
            <div className="ni-desc">Open the kids&apos; chore board</div>
          </div>
          <span className="ni-chevron">›</span>
        </button>
      </div>
    </article>
  );

  const renderParentAward = () => {
    if (!selectedAwardChild || !selectedDay) return null;

    return (
      <article className="phone-frame">
        <header className="p-header">
          <button type="button" className="p-back" onClick={() => navigateParent("home")}>
            <svg className="icon icon-sm">
              <use href="#lucide-chevron-left"></use>
            </svg>
          </button>
          <div>
            <div className="p-title">Award Star</div>
            <div className="p-subtitle">Tap child, chore, and day</div>
          </div>
        </header>

        <div className="p-body">
          <section className="award-section">
            <div className="award-section-label">Child</div>
            <div className="child-selector">
              {state.children.map((entry) => (
                <button
                  key={`award-child-${entry.id}`}
                  type="button"
                  className={`child-pill ${state.parentSelectedChildId === entry.id ? `active-${entry.id}` : ""}`}
                  onClick={() => parentSelectChild(entry.id)}
                >
                  <span className="cp-emoji">{entry.avatar}</span>
                  <span>{entry.name}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="award-section">
            <div className="award-section-label">Chore</div>
            <div className="chore-list">
              {selectedAwardChild.chores.map((chore) => {
                const status = chore.cells[state.parentSelectedDay];
                const awarded = status === "pending" || status === "claimed";
                const selected = state.parentSelectedChoreId === chore.id;

                if (awarded) {
                  return (
                    <div key={`awarded-${chore.id}`} className="chore-item awarded">
                      <span className="ci-icon">{chore.icon}</span>
                      <span className="ci-name">{chore.label}</span>
                      <span className="ci-awarded-badge">✓ {selectedDay.label}</span>
                    </div>
                  );
                }

                return (
                  <button
                    key={`chore-select-${chore.id}`}
                    type="button"
                    className={`chore-item ${selected ? "selected" : ""}`}
                    onClick={() => parentSelectChore(chore.id)}
                  >
                    <span className="ci-icon">{chore.icon}</span>
                    <span className="ci-name">{chore.label}</span>
                    <span className="ci-check">
                      <svg viewBox="0 0 24 24" fill="none">
                        <path
                          d="M5 13l4 4L19 7"
                          stroke="white"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        ></path>
                      </svg>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="award-section">
            <div className="award-section-label">Day</div>
            <div className="day-row">
              {days.map((day, dayIndex) => {
                const future = dayIndex > state.currentDay;
                const selected = state.parentSelectedDay === dayIndex;
                return (
                  <button
                    key={`award-day-${day.key}`}
                    type="button"
                    className={`day-chip ${selected ? "selected" : ""} ${selected && dayIndex === state.currentDay ? "today" : ""} ${future ? "is-future" : ""}`}
                    onClick={() => parentSelectDay(dayIndex)}
                    disabled={future}
                  >
                    <div className="dc-day">{day.label}</div>
                    <div className="dc-date">{dayDates[dayIndex]}</div>
                  </button>
                );
              })}
            </div>
          </section>

          {state.awardToast ? (
            <div className="undo-toast">
              <div className="ut-text">
                Awarded <strong>{state.awardToast.choreLabel}</strong> to <strong>{state.awardToast.childName}</strong> for{" "}
                <strong>{state.awardToast.dayLabel}</strong>
              </div>
              <button type="button" className="ut-undo" onClick={undoAward}>
                Undo
              </button>
            </div>
          ) : null}
        </div>

        <footer className="p-footer">
          <button
            type="button"
            className={`award-btn ${disableAward ? "is-disabled" : ""}`}
            onClick={() => awardSelected(false)}
            disabled={disableAward}
          >
            ⭐ Award Star
          </button>
          <button
            type="button"
            className={`award-bonus-btn ${disableBonusAward ? "is-disabled" : ""}`}
            onClick={() => awardSelected(true)}
            disabled={disableBonusAward}
          >
            🌟 Award Bonus Star Instead
          </button>
        </footer>
      </article>
    );
  };

  const renderParentPayday = () => (
    <article className="phone-frame">
      <header className="p-header">
        <button type="button" className="p-back" onClick={() => navigateParent("home")}>
          <svg className="icon icon-sm">
            <use href="#lucide-chevron-left"></use>
          </svg>
        </button>
        <div>
          <div className="p-title">Payday</div>
          <div className="p-subtitle">{paydayDateLabel}</div>
        </div>
      </header>

      <div className="p-body">
        <section className="payday-banner">
          <div className="coin-icon">
            <CoinUse width={28} height={28} />
          </div>
          <div className="pb-title">Ready to Run Payday</div>
          <div className="pb-sub">Review each child&apos;s weekly summary</div>
        </section>

        {state.children.map((child) => {
          const preview = previewPayday(child, state.interestRate);
          return (
            <section key={`payday-summary-${child.id}`} className={`child-summary ${child.id}`}>
              <div className="cs-header">
                <div className="sc-avatar">{child.avatar}</div>
                <div className="cs-name">{child.name}</div>
              </div>
              <div className="summary-row">
                <span className="sr-label">Carried Balance</span>
                <span className="sr-value">{preview.carried} coins</span>
              </div>
              <div className="summary-row">
                <span className="sr-label">Stars Claimed</span>
                <span className="sr-value">{preview.stars} ⭐</span>
              </div>
              <div className="summary-row interest">
                <span className="sr-label">Interest ({state.interestRate}% on saved)</span>
                <span className="sr-value">
                  +{preview.interest} coin{preview.interest === 1 ? "" : "s"} ✨
                </span>
              </div>
              <div className="summary-row total">
                <span className="sr-label">New Balance</span>
                <span className="sr-value">
                  <span className="coin-icon">
                    <CoinUse width={14} height={14} />
                  </span>{" "}
                  {preview.newBalance}
                </span>
              </div>
            </section>
          );
        })}
      </div>

      <footer className="p-footer">
        <button type="button" className="payday-confirm-btn" onClick={runPayday}>
          <span className="coin-icon">
            <CoinUse width={18} height={18} />
          </span>{" "}
          Run Payday
        </button>
      </footer>
    </article>
  );

  const renderParentRedemptions = () => (
    <article className="phone-frame">
      <header className="p-header">
        <button type="button" className="p-back" onClick={() => navigateParent("home")}>
          <svg className="icon icon-sm">
            <use href="#lucide-chevron-left"></use>
          </svg>
        </button>
        <div>
          <div className="p-title">Redemptions</div>
          <div className="p-subtitle">Rewards to fulfill</div>
        </div>
      </header>

      <div className="p-body">
        <div className="queue-tabs">
          <button
            type="button"
            className={`queue-tab ${state.queueTab === "pending" ? "active" : ""}`}
            onClick={() => setQueueTab("pending")}
          >
            Pending <span className="qt-count qt-count-pending">{pendingRedemptionCount}</span>
          </button>
          <button
            type="button"
            className={`queue-tab ${state.queueTab === "fulfilled" ? "active" : ""}`}
            onClick={() => setQueueTab("fulfilled")}
          >
            Fulfilled <span className="qt-count qt-count-fulfilled">{fulfilledRedemptionCount}</span>
          </button>
        </div>

        {activeQueue.length === 0 ? (
          <div className="setting-row empty-state-row">No {state.queueTab} redemptions</div>
        ) : (
          activeQueue.map((entry) => {
            const child = childById.get(entry.childId);
            const reward = rewardById.get(entry.rewardId);
            if (!child || !reward) return null;

            const meta =
              entry.status === "pending"
                ? formatRelativeTime(entry.createdAt)
                : `Fulfilled ${formatRelativeTime(entry.fulfilledAt ?? entry.createdAt)}`;

            return (
              <div key={`queue-${entry.id}`} className={`queue-item ${entry.status === "fulfilled" ? "fulfilled" : ""}`}>
                <div className="qi-icon">{reward.icon}</div>
                <div className="qi-info">
                  <div className="qi-reward">{reward.name}</div>
                  <div className="qi-meta">
                    <span className={`qi-child ${child.id}`}>{child.name}</span> · {meta}
                  </div>
                </div>
                {entry.status === "pending" ? (
                  <>
                    <button type="button" className="qi-fulfill" onClick={() => fulfillRedemption(entry.id)}>
                      Fulfill
                    </button>
                    <button
                      type="button"
                      className="p-back icon-archive-btn"
                      aria-label="Archive request"
                      title="Archive request"
                      onClick={() => {
                        const confirmed = window.confirm(`Remove "${reward.name}" from the queue?`);
                        if (!confirmed) return;
                        archiveRedemption(entry.id);
                      }}
                    >
                      <svg className="icon icon-sm">
                        <use href="#lucide-archive"></use>
                      </svg>
                    </button>
                  </>
                ) : (
                  <div className="qi-status">✓ Done</div>
                )}
              </div>
            );
          })
        )}

        {state.queueTab === "pending" && fulfilledRedemptions.length > 0 ? (
          <>
            <div className="nav-group-label nav-group-label-spaced">Recently Fulfilled</div>
            {fulfilledRedemptions.slice(0, 1).map((entry) => {
              const child = childById.get(entry.childId);
              const reward = rewardById.get(entry.rewardId);
              if (!child || !reward) return null;

              return (
                <div key={`recent-${entry.id}`} className="queue-item fulfilled">
                  <div className="qi-icon">{reward.icon}</div>
                  <div className="qi-info">
                    <div className="qi-reward">{reward.name}</div>
                    <div className="qi-meta">
                      <span className={`qi-child ${child.id}`}>{child.name}</span> · Fulfilled{" "}
                      {formatRelativeTime(entry.fulfilledAt ?? entry.createdAt)}
                    </div>
                  </div>
                  <div className="qi-status">✓ Done</div>
                </div>
              );
            })}
          </>
        ) : null}
      </div>
    </article>
  );

  const renderParentSettings = () => {
    const sortedRewards = [...adminRewards].sort((left, right) => left.sortOrder - right.sortOrder);
    const selectedPaydayIndex = Math.max(0, Math.min(6, Number(paydayDayDraft) || 0));
    const isSharedKidPinModified = sharedKidPinDraft.trim().length > 0;
    const weekdayOptions = [
      { label: "Monday", value: 2 },
      { label: "Tuesday", value: 3 },
      { label: "Wednesday", value: 4 },
      { label: "Thursday", value: 5 },
      { label: "Friday", value: 6 },
      { label: "Saturday", value: 0 },
      { label: "Sunday", value: 1 },
    ];
    const activeChoreCountByChild = new Map<string, number>();
    state.children.forEach((child) => {
      activeChoreCountByChild.set(
        child.id,
        adminChores.filter((chore) => chore.childId === child.id && chore.active).length,
      );
    });

    const sharedChoreMap = new Map<string, SharedChoreItem>();
    adminChores.forEach((chore) => {
      const current = sharedChoreMap.get(chore.slug);
      if (current) {
        current.sortOrder = Math.min(current.sortOrder, chore.sortOrder);
        current.itemIdsByChild[chore.childId] = chore.id;
        current.activeByChild[chore.childId] = chore.active;
        if (chore.childId === state.children[0]?.id) {
          current.label = chore.label;
          current.icon = chore.icon;
        }
        return;
      }

      sharedChoreMap.set(chore.slug, {
        slug: chore.slug,
        label: chore.label,
        icon: chore.icon,
        sortOrder: chore.sortOrder,
        itemIdsByChild: { [chore.childId]: chore.id },
        activeByChild: { [chore.childId]: chore.active },
      });
    });

    const sharedChores = [...sharedChoreMap.values()].sort((left, right) => left.sortOrder - right.sortOrder);
    const flashClass = (key: string) => (savedFlashKeys.has(key) ? " saved-flash" : "");

    const setSharedChoreDraft = (slug: string, patch: Partial<Pick<SharedChoreItem, "label" | "icon">>) => {
      setAdminChores((prev) =>
        prev.map((entry) =>
          entry.slug === slug
            ? {
                ...entry,
                ...(typeof patch.label === "string" ? { label: patch.label } : {}),
                ...(typeof patch.icon === "string" ? { icon: patch.icon } : {}),
              }
            : entry,
        ),
      );
    };

    const saveSharedChoreDraft = async (slug: string) => {
      const entries = adminChores.filter((entry) => entry.slug === slug);
      if (entries.length === 0) return;
      if (savingSharedChoreSlug === slug) return;

      const label = entries[0]?.label ?? "";
      const icon = entries[0]?.icon ?? "";

      try {
        setSavingSharedChoreSlug(slug);
        const response = await timedFetch("mutation", "/api/admin/chores/shared", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ slug, label, icon }),
        });
        const payload = (await response.json().catch(() => ({}))) as { error?: string; chores?: AdminChoreItem[]; state?: LiveBoardPayload };
        if (!response.ok) throw new Error(payload.error ?? "Unable to save chore.");
        setAdminChores(payload.chores ?? []);
        if (payload.state) applyLiveBoard(payload.state);
        flashSaved(`chore-${slug}`);
      } finally {
        setSavingSharedChoreSlug((current) => (current === slug ? null : current));
      }
    };

    const toggleChildChoreAssignment = async (childId: string, chore: SharedChoreItem) => {
      const assignmentKey = `${childId}:${chore.slug}`;
      if (pendingAssignmentKeys.has(assignmentKey)) return;

      const existingChoreId = chore.itemIdsByChild[childId];
      const isActive = Boolean(chore.activeByChild[childId]);
      setPendingAssignmentKeys((prev) => {
        const next = new Set(prev);
        next.add(assignmentKey);
        return next;
      });

      try {
        if (existingChoreId) {
          setAdminChores((prev) =>
            prev.map((entry) => (entry.id === existingChoreId ? { ...entry, active: !isActive } : entry)),
          );
          await updateChore(existingChoreId, { active: !isActive }, { silent: true, skipRefresh: true, applyServerState: false });
          void refreshLiveBoard();
        } else {
          const tempId = `temp-${childId}-${chore.slug}-${Date.now()}`;
          setAdminChores((prev) => [
            ...prev,
            {
              id: tempId,
              childId,
              slug: chore.slug,
              label: chore.label,
              icon: chore.icon,
              sortOrder: chore.sortOrder,
              active: true,
            },
          ]);

          const response = await timedFetch("mutation", "/api/admin/chores", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              childId,
              label: chore.label,
              icon: chore.icon,
            }),
          });

          const payload = (await response.json().catch(() => ({}))) as { error?: string; chores?: AdminChoreItem[] };
          if (!response.ok) {
            throw new Error(payload.error ?? "Unable to assign chore.");
          }

          setAdminChores(payload.chores ?? []);
          void refreshLiveBoard();
        }
        flashSaved(`assign-${childId}`);
      } catch (error) {
        setAdminError(error instanceof Error ? error.message : "Unable to update assignment.");
        await loadAdminData();
      } finally {
        setPendingAssignmentKeys((prev) => {
          const next = new Set(prev);
          next.delete(assignmentKey);
          return next;
        });
      }
    };

    const toggleSharedChoreArchive = async (slug: string) => {
      const entries = adminChores.filter((entry) => entry.slug === slug);
      if (entries.length === 0) return;

      try {
        setSavingSharedChoreSlug(slug);
        const response = await timedFetch("mutation", "/api/admin/chores/shared", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ slug, archive: true }),
        });
        const payload = (await response.json().catch(() => ({}))) as { error?: string; chores?: AdminChoreItem[]; state?: LiveBoardPayload };
        if (!response.ok) throw new Error(payload.error ?? "Unable to archive chore.");
        setAdminChores(payload.chores ?? []);
        if (payload.state) applyLiveBoard(payload.state);
        flashSaved(`chore-${slug}`);
      } catch (error) {
        setAdminError(error instanceof Error ? error.message : "Unable to archive chore.");
      } finally {
        setSavingSharedChoreSlug((current) => (current === slug ? null : current));
      }
    };

    const removeSharedChore = async (slug: string, label: string) => {
      const confirmed = window.confirm(`Delete "${label}" for all children? This cannot be undone.`);
      if (!confirmed) return;

      await toggleSharedChoreArchive(slug);
    };

    const handleChoreDrop = async (targetSlug: string, position: "before" | "after") => {
      if (isSavingChoreOrder || !draggingChoreSlug) return;
      const orderedSlugs = sharedChores.map((entry) => entry.slug);
      const fromIndex = orderedSlugs.indexOf(draggingChoreSlug);
      const toIndex = orderedSlugs.indexOf(targetSlug);
      if (fromIndex < 0 || toIndex < 0) return;
      if (fromIndex === toIndex && position === "before") return;

      const nextOrder = [...orderedSlugs];
      const [movedSlug] = nextOrder.splice(fromIndex, 1);
      let insertIndex = position === "after" ? toIndex + 1 : toIndex;
      if (fromIndex < insertIndex) insertIndex -= 1;
      insertIndex = Math.max(0, Math.min(insertIndex, nextOrder.length));
      nextOrder.splice(insertIndex, 0, movedSlug);
      const bySlug = new Map(nextOrder.map((slug, index) => [slug, index]));

      setAdminChores((prev) =>
        prev
          .map((entry) => {
            const mapped = bySlug.get(entry.slug);
            return typeof mapped === "number" ? { ...entry, sortOrder: mapped } : entry;
          })
          .sort((left, right) => left.sortOrder - right.sortOrder),
      );
      setDraggingChoreSlug(null);
      setChoreDropTarget(null);
      setIsSavingChoreOrder(true);

      try {
        const response = await timedFetch("reorder", "/api/admin/chores/reorder", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ orderedSlugs: nextOrder }),
        });

        const payload = (await response.json().catch(() => ({}))) as { error?: string; chores?: AdminChoreItem[] };
        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to reorder chores.");
        }

        if (payload.chores) {
          setAdminChores(payload.chores);
        }
        void refreshLiveBoard();
        flashSaved("chore-order");
      } catch (error) {
        setAdminError(error instanceof Error ? error.message : "Unable to reorder chores.");
        await loadAdminData();
      } finally {
        setIsSavingChoreOrder(false);
      }
    };

    const setRewardDraft = (
      rewardId: string,
      patch: Partial<Pick<AdminRewardItem, "name" | "icon" | "description" | "cost">>,
    ) => {
      setAdminRewards((prev) => prev.map((entry) => (entry.id === rewardId ? { ...entry, ...patch } : entry)));
    };

    const saveRewardDraft = async (rewardId: string) => {
      const reward = adminRewards.find((entry) => entry.id === rewardId);
      if (!reward) return;
      if (savingRewardId === rewardId) return;

      try {
        setSavingRewardId(rewardId);
        await updateReward(rewardId, {
          name: reward.name,
          icon: reward.icon,
          description: reward.description,
          cost: reward.cost,
        });
        setEditingRewardId(null);
      } finally {
        setSavingRewardId((current) => (current === rewardId ? null : current));
      }
    };

    const handleRewardDrop = async (targetRewardId: string, position: "before" | "after") => {
      if (isSavingRewardOrder || !draggingRewardId) return;
      const orderedIds = sortedRewards.map((reward) => reward.id);
      const fromIndex = orderedIds.indexOf(draggingRewardId);
      const toIndex = orderedIds.indexOf(targetRewardId);
      if (fromIndex < 0 || toIndex < 0) return;
      if (fromIndex === toIndex && position === "before") return;

      const nextOrder = [...orderedIds];
      const [movedId] = nextOrder.splice(fromIndex, 1);
      let insertIndex = position === "after" ? toIndex + 1 : toIndex;
      if (fromIndex < insertIndex) insertIndex -= 1;
      insertIndex = Math.max(0, Math.min(insertIndex, nextOrder.length));
      nextOrder.splice(insertIndex, 0, movedId);
      const byId = new Map(nextOrder.map((id, index) => [id, index]));

      setAdminRewards((prev) =>
        prev
          .map((entry) => {
            const mapped = byId.get(entry.id);
            return typeof mapped === "number" ? { ...entry, sortOrder: mapped } : entry;
          })
          .sort((left, right) => left.sortOrder - right.sortOrder),
      );
      setDraggingRewardId(null);
      setRewardDropTarget(null);
      setIsSavingRewardOrder(true);

      try {
        const response = await timedFetch("reorder", "/api/admin/rewards/reorder", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ orderedRewardIds: nextOrder }),
        });

        const payload = (await response.json().catch(() => ({}))) as { error?: string; rewards?: AdminRewardItem[] };
        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to reorder rewards.");
        }

        if (payload.rewards) {
          setAdminRewards(payload.rewards);
        }
        void refreshLiveRewards();
        flashSaved("reward-order");
      } catch (error) {
        setAdminError(error instanceof Error ? error.message : "Unable to reorder rewards.");
        await loadAdminData();
      } finally {
        setIsSavingRewardOrder(false);
      }
    };

    const autoSavePaydayDay = async (nextPaydayDay: number) => {
      setPaydayDayDraft(String(nextPaydayDay));
      const saved = await saveHouseholdSettings({
        silent: true,
        paydayDay: nextPaydayDay,
        interestRate: Number(interestRateDraft),
      });
      if (saved) {
        flashSaved("household-payday");
      }
    };

    const autoSaveInterestRate = async () => {
      const parsedInterest = Number(interestRateDraft);
      if (!Number.isFinite(parsedInterest)) return;
      const saved = await saveHouseholdSettings({
        silent: true,
        interestRate: parsedInterest,
        paydayDay: Number(paydayDayDraft),
      });
      if (saved) {
        flashSaved("household-interest");
      }
    };

    const saveSharedKidPin = async () => {
      const nextPin = sharedKidPinDraft.trim();
      if (!nextPin) {
        setAdminError("Enter a 4-12 digit kids PIN.");
        return;
      }
      const saved = await saveHouseholdSettings({
        sharedKidPin: nextPin,
      });
      if (saved) {
        flashSaved("household-pin");
      }
    };

    return (
      <article className="settings-frame settings-spec-frame">
        <header className="settings-header">
          <button type="button" className="p-back" onClick={() => navigateParent("home")}>
            <svg className="icon icon-sm">
              <use href="#lucide-chevron-left"></use>
            </svg>
          </button>
          <div>
            <div className="p-title">Settings</div>
          </div>
        </header>

        <div className="settings-content settings-spec-content">
          <nav className="ps-section-nav" aria-label="Settings sections">
            {SETTINGS_SECTIONS.map((section) => (
              <button
                key={section.id}
                type="button"
                className={`ps-section-tab ${settingsSection === section.id ? "active" : ""}`}
                onClick={() => navigateSettingsSection(section.id)}
                aria-current={settingsSection === section.id ? "page" : undefined}
                aria-pressed={settingsSection === section.id}
              >
                {section.label}
              </button>
            ))}
          </nav>

          {settingsSection === "children" ? <section className="ps-group">
            <div className="ps-group-header">
              <div className="ps-group-title">Children</div>
            </div>

            {state.children.map((child) => {
              const isOpen = expandedChildId === child.id;
              const activeCount = activeChoreCountByChild.get(child.id) ?? 0;
              const palette = generateChildPalette(child.accent, child.id);
              const childCardStyle = {
                "--child-avatar-bg": palette[200],
              } as CSSProperties;

              return (
                <article
                  key={`config-${child.id}`}
                  className={`ps-child-card ${child.id} ${isOpen ? "open" : ""}`}
                  style={childCardStyle}
                >
                  <button
                    type="button"
                    className="ps-child-card-head"
                    onClick={() => setExpandedChildId((prev) => (prev === child.id ? "" : child.id))}
                  >
                    <div className="cc-avatar">{child.avatar}</div>
                    <div className="cc-info">
                      <div className="cc-name">{child.name}</div>
                      <div className="cc-meta">
                        Age {child.age} · {activeCount} chores
                      </div>
                    </div>
                    <svg className="icon icon-sm cc-chevron">
                      <use href="#lucide-chevron-right"></use>
                    </svg>
                  </button>

                  {isOpen ? (
                    <div className="ps-child-card-body">
                      <div className="ps-field-row">
                        <label className="ps-field ps-field-emoji">
                          <span className="ps-field-label">Avatar</span>
                          <input
                            className="ps-field-input"
                            type="text"
                            maxLength={2}
                            value={child.avatar}
                            onChange={(event) => updateChildDraft(child.id, { avatar: event.target.value })}
                          />
                        </label>
                        <label className="ps-field ps-field-grow">
                          <span className="ps-field-label">Name</span>
                          <input
                            className="ps-field-input"
                            value={child.name}
                            onChange={(event) => updateChildDraft(child.id, { name: event.target.value })}
                          />
                        </label>
                        <label className="ps-field ps-field-color">
                          <span className="ps-field-label">Color</span>
                          <span className="ps-color-swatch">
                            <input
                              type="color"
                              value={resolveChildAccent(child.accent, child.id)}
                              onChange={(event) => updateChildDraft(child.id, { accent: event.target.value })}
                            />
                          </span>
                        </label>
                        <label className="ps-field ps-field-number">
                          <span className="ps-field-label">Age</span>
                          <input
                            className="ps-field-input"
                            type="number"
                            min={1}
                            max={18}
                            value={child.age}
                            onChange={(event) => updateChildDraft(child.id, { age: Number(event.target.value) || child.age })}
                          />
                        </label>
                      </div>

                      <div className="ps-chip-wrap">
                        <div className="ps-field-label">Assigned Chores</div>
                        <div className="ps-chip-list">
                          {sharedChores.map((chore) => {
                            const isActive = Boolean(chore.activeByChild[child.id]);
                            const assignmentKey = `${child.id}:${chore.slug}`;
                            const isPendingAssignment = pendingAssignmentKeys.has(assignmentKey);
                            return (
                              <button
                                key={`${child.id}-${chore.slug}`}
                                type="button"
                                className={`ps-chore-chip ${isActive ? "active" : ""} ${isPendingAssignment ? "pending" : ""}`}
                                onClick={() => void toggleChildChoreAssignment(child.id, chore)}
                                disabled={isPendingAssignment}
                              >
                                <span className="cc-icon">{chore.icon}</span> {chore.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="ps-card-actions">
                        <button
                          type="button"
                          className="ps-btn-save"
                          onClick={() => void saveChildProfile(child.id)}
                          disabled={isDemoMode || savingChildId === child.id}
                        >
                          {savingChildId === child.id ? "Saving..." : "Save Changes"}
                        </button>
                        <button
                          type="button"
                          className="ps-action-btn delete"
                          onClick={() => {
                            const confirmed = window.confirm(`Delete child "${child.name}"? This cannot be undone.`);
                            if (!confirmed) return;
                            void removeChild(child.id);
                          }}
                          disabled={isDemoMode || state.children.length <= 1}
                          title="Delete child"
                        >
                          <svg className="icon icon-sm">
                            <use href="#lucide-trash-2"></use>
                          </svg>
                        </button>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}

            <button type="button" className="ps-add-item-btn" onClick={() => void createChild()} disabled={isDemoMode || isCreatingChild}>
              {isCreatingChild ? "Adding Child..." : "+ Add Child"}
            </button>
          </section> : null}

          {settingsSection === "chores" ? <section className="ps-group">
            <div className="ps-group-header">
              <div className="ps-group-title">Chores</div>
            </div>

            {sharedChores.map((chore) => (
              <div
                key={`shared-${chore.slug}`}
                className={`ps-chore-row ${flashClass(`chore-${chore.slug}`)} ${draggingChoreSlug === chore.slug ? "is-dragging" : ""} ${
                  choreDropTarget?.slug === chore.slug && choreDropTarget.position === "before" ? "drop-before" : ""
                } ${choreDropTarget?.slug === chore.slug && choreDropTarget.position === "after" ? "drop-after" : ""} ${
                  isSavingChoreOrder ? "is-order-saving" : ""
                } ${savingSharedChoreSlug === chore.slug ? "is-saving" : ""}`}
                draggable={!isSavingChoreOrder}
                onDragStart={() => {
                  if (isSavingChoreOrder) return;
                  setDraggingChoreSlug(chore.slug);
                  setChoreDropTarget({ slug: chore.slug, position: "before" });
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  const rect = event.currentTarget.getBoundingClientRect();
                  const position = event.clientY - rect.top > rect.height / 2 ? "after" : "before";
                  setChoreDropTarget({ slug: chore.slug, position });
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const position = choreDropTarget?.slug === chore.slug ? choreDropTarget.position : "before";
                  void handleChoreDrop(chore.slug, position);
                }}
                onDragEnd={() => {
                  setDraggingChoreSlug(null);
                  setChoreDropTarget(null);
                }}
              >
                <svg className="icon icon-sm ps-drag-icon">
                  <use href="#lucide-grip-vertical"></use>
                </svg>
                <input
                  className="ps-chore-icon"
                  type="text"
                  maxLength={2}
                  value={chore.icon}
                  onChange={(event) => setSharedChoreDraft(chore.slug, { icon: event.target.value })}
                  onBlur={() => void saveSharedChoreDraft(chore.slug)}
                  disabled={savingSharedChoreSlug === chore.slug}
                />
                <input
                  className="ps-chore-name"
                  value={chore.label}
                  onChange={(event) => setSharedChoreDraft(chore.slug, { label: event.target.value })}
                  onBlur={() => void saveSharedChoreDraft(chore.slug)}
                  disabled={savingSharedChoreSlug === chore.slug}
                />
                <div className="ps-item-actions">
                  <button
                    type="button"
                    className="ps-action-btn archive"
                    onClick={() => void toggleSharedChoreArchive(chore.slug)}
                    title="Archive"
                  >
                    <svg className="icon icon-sm">
                      <use href="#lucide-archive"></use>
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="ps-action-btn delete"
                    onClick={() => void removeSharedChore(chore.slug, chore.label)}
                    title="Delete"
                  >
                    <svg className="icon icon-sm">
                      <use href="#lucide-x"></use>
                    </svg>
                  </button>
                </div>
              </div>
            ))}

            {isAddingChore ? (
              <div className="ps-add-form">
                <input
                  className="ps-chore-icon"
                  type="text"
                  maxLength={2}
                  value={newChoreIcon}
                  onChange={(event) => setNewChoreIcon(event.target.value)}
                  placeholder="✨"
                />
                <input
                  className="ps-chore-name"
                  value={newChoreLabel}
                  onChange={(event) => setNewChoreLabel(event.target.value)}
                  placeholder="Chore name"
                />
                <div className="ps-add-form-actions">
                  <button
                    type="button"
                    className="ps-btn-save"
                    onClick={async () => {
                      const created = await createChore();
                      if (created) setIsAddingChore(false);
                    }}
                    disabled={isDemoMode || isCreatingChore}
                  >
                    {isCreatingChore ? "Saving..." : "Add Chore"}
                  </button>
                  <button type="button" className="ps-btn-cancel" onClick={() => setIsAddingChore(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="ps-add-item-btn" onClick={() => setIsAddingChore(true)} disabled={isCreatingChore}>
                + Add Chore
              </button>
            )}
          </section> : null}

          {settingsSection === "rewards" ? <section className="ps-group">
            <div className="ps-group-header">
              <div className="ps-group-title">Reward Store</div>
            </div>

            {sortedRewards.map((reward) => {
              const isEditing = editingRewardId === reward.id;
              if (isEditing) {
                return (
                  <article key={reward.id} className="ps-reward-card is-editing">
                    <div className="ps-reward-edit-top">
                      <svg className="icon icon-sm ps-drag-icon">
                        <use href="#lucide-grip-vertical"></use>
                      </svg>
                      <input
                        className="ps-reward-icon-input"
                        type="text"
                        maxLength={2}
                        value={reward.icon}
                        onChange={(event) => setRewardDraft(reward.id, { icon: event.target.value })}
                      />
                      <input
                        className="ps-reward-name-input"
                        value={reward.name}
                        onChange={(event) => setRewardDraft(reward.id, { name: event.target.value })}
                      />
                      <div className="ps-reward-cost-field">
                        <span className="coin-icon">
                          <CoinUse width={14} height={14} />
                        </span>
                        <input
                          type="number"
                          min={1}
                          value={reward.cost}
                          onChange={(event) =>
                            setRewardDraft(reward.id, { cost: Math.max(1, Number(event.target.value) || reward.cost) })
                          }
                        />
                      </div>
                    </div>

                    <div className="ps-reward-edit-fields">
                      <label className="ps-field-label">Description</label>
                      <textarea
                        className="ps-reward-edit-desc"
                        value={reward.description}
                        onChange={(event) => setRewardDraft(reward.id, { description: event.target.value })}
                      />
                      <div className="ps-reward-edit-actions">
                        <button
                          type="button"
                          className="ps-btn-save"
                          onClick={() => void saveRewardDraft(reward.id)}
                          disabled={isDemoMode || savingRewardId === reward.id}
                        >
                          {savingRewardId === reward.id ? "Saving..." : "Save"}
                        </button>
                        <button
                          type="button"
                          className="ps-action-btn archive"
                          onClick={() => void updateReward(reward.id, { active: !reward.active })}
                          disabled={isDemoMode}
                          title="Archive"
                        >
                          <svg className="icon icon-sm">
                            <use href="#lucide-archive"></use>
                          </svg>
                        </button>
                        <button
                          type="button"
                          className="ps-action-btn delete"
                          onClick={() => {
                            const confirmed = window.confirm(`Delete reward "${reward.name}"? This cannot be undone.`);
                            if (!confirmed) return;
                            void deleteReward(reward.id);
                            setEditingRewardId(null);
                          }}
                          disabled={isDemoMode}
                          title="Delete"
                        >
                          <svg className="icon icon-sm">
                            <use href="#lucide-x"></use>
                          </svg>
                        </button>
                      </div>
                    </div>
                  </article>
                );
              }

              return (
                <button
                  key={reward.id}
                  type="button"
                  className={`ps-reward-card ${flashClass(`reward-${reward.id}`)} ${draggingRewardId === reward.id ? "is-dragging" : ""} ${
                    rewardDropTarget?.id === reward.id && rewardDropTarget.position === "before" ? "drop-before" : ""
                  } ${rewardDropTarget?.id === reward.id && rewardDropTarget.position === "after" ? "drop-after" : ""} ${
                    isSavingRewardOrder ? "is-order-saving" : ""
                  }`}
                  onClick={() => {
                    setIsAddingReward(false);
                    setEditingRewardId(reward.id);
                  }}
                  draggable={!isSavingRewardOrder}
                  onDragStart={() => {
                    if (isSavingRewardOrder) return;
                    setDraggingRewardId(reward.id);
                    setRewardDropTarget({ id: reward.id, position: "before" });
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    const rect = event.currentTarget.getBoundingClientRect();
                    const position = event.clientY - rect.top > rect.height / 2 ? "after" : "before";
                    setRewardDropTarget({ id: reward.id, position });
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const position = rewardDropTarget?.id === reward.id ? rewardDropTarget.position : "before";
                    void handleRewardDrop(reward.id, position);
                  }}
                  onDragEnd={() => {
                    setDraggingRewardId(null);
                    setRewardDropTarget(null);
                  }}
                >
                  <svg className="icon icon-sm ps-drag-icon">
                    <use href="#lucide-grip-vertical"></use>
                  </svg>
                  <div className="ps-reward-icon">{reward.icon}</div>
                  <div className="ps-reward-info">
                    <div className="ps-reward-name">{reward.name}</div>
                    <div className="ps-reward-desc">{reward.description}</div>
                  </div>
                  <div className="ps-reward-cost">
                    <span className="coin-icon">
                      <CoinUse width={11} height={11} />
                    </span>
                    {reward.cost}
                  </div>
                  <svg className="icon icon-sm ps-reward-chevron">
                    <use href="#lucide-chevron-right"></use>
                  </svg>
                </button>
              );
            })}

            {isAddingReward ? (
              <article className="ps-reward-card is-adding">
                <div className="ps-reward-edit-top">
                  <input
                    className="ps-reward-icon-input"
                    type="text"
                    maxLength={2}
                    value={newRewardIcon}
                    onChange={(event) => setNewRewardIcon(event.target.value)}
                    placeholder="🎁"
                  />
                  <input
                    className="ps-reward-name-input"
                    value={newRewardName}
                    onChange={(event) => setNewRewardName(event.target.value)}
                    placeholder="Reward name..."
                  />
                  <div className="ps-reward-cost-field">
                    <span className="coin-icon">
                      <CoinUse width={14} height={14} />
                    </span>
                    <input
                      type="number"
                      min={1}
                      value={newRewardCost}
                      onChange={(event) => setNewRewardCost(event.target.value)}
                      placeholder="0"
                    />
                  </div>
                </div>
                <div className="ps-reward-edit-fields">
                  <label className="ps-field-label">Description</label>
                  <textarea
                    className="ps-reward-edit-desc"
                    value={newRewardDescription}
                    onChange={(event) => setNewRewardDescription(event.target.value)}
                    placeholder="What does the kid get? Shown in the reward store."
                  />
                  <div className="ps-reward-edit-actions">
                    <button
                      type="button"
                      className="ps-btn-save-green"
                      onClick={async () => {
                        const created = await createReward();
                        if (created) setIsAddingReward(false);
                      }}
                      disabled={isDemoMode || isCreatingReward}
                    >
                      {isCreatingReward ? "Saving..." : "Add Reward"}
                    </button>
                    <button type="button" className="ps-btn-cancel" onClick={() => setIsAddingReward(false)}>
                      Cancel
                    </button>
                  </div>
                </div>
              </article>
            ) : (
              <button
                type="button"
                className="ps-add-item-btn"
                onClick={() => {
                  setEditingRewardId(null);
                  setIsAddingReward(true);
                }}
                disabled={isCreatingReward}
              >
                + Add Reward
              </button>
            )}
          </section> : null}

          {settingsSection === "household" ? <section className="ps-group">
            <div className="ps-group-header">
              <div className="ps-group-title">Household</div>
            </div>

            <div className={`ps-setting-row ${flashClass("household-payday")} ${isSavingHouseholdSettings ? "is-saving" : ""}`}>
              <div className="ps-setting-icon">
                <svg className="icon">
                  <use href="#lucide-calendar"></use>
                </svg>
              </div>
              <div className="ps-setting-info">
                <div className="ps-setting-name">Payday Day</div>
                <div className="ps-setting-desc">When stars convert to coins</div>
              </div>
              <div className="ps-setting-control">
                <select
                  className="ps-setting-select"
                  value={paydayDayDraft}
                  onChange={(event) => void autoSavePaydayDay(Number(event.target.value))}
                  disabled={isSavingHouseholdSettings}
                >
                  {weekdayOptions.map((option) => (
                    <option key={option.label} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className={`ps-setting-row ${flashClass("household-interest")} ${isSavingHouseholdSettings ? "is-saving" : ""}`}>
              <div className="ps-setting-icon">
                <svg className="icon">
                  <use href="#lucide-trending-up"></use>
                </svg>
              </div>
              <div className="ps-setting-info">
                <div className="ps-setting-name">Interest Rate</div>
                <div className="ps-setting-desc">Bonus coins from saved balance</div>
              </div>
              <div className="ps-setting-control ps-setting-interest">
                <input
                  className="ps-setting-input"
                  type="number"
                  min={0}
                  max={100}
                  value={interestRateDraft}
                  onChange={(event) => setInterestRateDraft(event.target.value)}
                  onBlur={() => void autoSaveInterestRate()}
                  disabled={isSavingHouseholdSettings}
                />
                <span>%</span>
              </div>
            </div>

            <div className={`ps-setting-row ${flashClass("household-pin")} ${isSavingHouseholdSettings ? "is-saving" : ""}`}>
              <div className="ps-setting-icon">
                <svg className="icon">
                  <use href="#lucide-key-round"></use>
                </svg>
              </div>
              <div className="ps-setting-info">
                <div className="ps-setting-name">Kids PIN</div>
                <div className="ps-setting-desc">Shared PIN for all kids</div>
              </div>
              <div className="ps-setting-control ps-setting-pin-control">
                <input
                  className="ps-setting-input ps-setting-pin-input"
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={sharedKidPinDraft}
                  placeholder="••••"
                  onChange={(event) => setSharedKidPinDraft(event.target.value)}
                  disabled={isSavingHouseholdSettings}
                />
                <button
                  type="button"
                  className="ps-setting-pin-btn"
                  onClick={() => void saveSharedKidPin()}
                  disabled={isSavingHouseholdSettings || !isSharedKidPinModified}
                >
                  Update
                </button>
              </div>
            </div>

            <button
              type="button"
              className="ps-week-rollover-btn"
              onClick={() => void startNewWeek()}
              disabled={isDemoMode || isStartingNewWeek || isSavingHouseholdSettings || state.kidsScreen !== "closed"}
            >
              {isStartingNewWeek ? "Starting New Week..." : "Start New Week"}
            </button>
            <div className="ps-hidden" aria-hidden="true">
              Current payday: {days[selectedPaydayIndex]?.label ?? "Fri"}
            </div>
          </section> : null}

          {settingsSection === "app" ? <section className="ps-group">
            <div className="ps-group-header">
              <div className="ps-group-title">App</div>
            </div>

            <button
              type="button"
              className={`ps-setting-row ${flashClass("app-sounds")}`}
              onClick={() => {
                toggleSounds();
                flashSaved("app-sounds");
              }}
            >
              <div className="ps-setting-icon">
                <svg className="icon">
                  <use href="#lucide-volume-2"></use>
                </svg>
              </div>
              <div className="ps-setting-info">
                <div className="ps-setting-name">Sounds</div>
                <div className="ps-setting-desc">Claim, redeem, payday effects</div>
              </div>
              <span className={`toggle ${state.settings.sounds ? "on" : "off"}`}></span>
            </button>

            <button
              type="button"
              className={`ps-setting-row ${flashClass("app-animations")}`}
              onClick={() => {
                toggleAnimations();
                flashSaved("app-animations");
              }}
            >
              <div className="ps-setting-icon">
                <svg className="icon">
                  <use href="#lucide-sparkles"></use>
                </svg>
              </div>
              <div className="ps-setting-info">
                <div className="ps-setting-name">Animations</div>
                <div className="ps-setting-desc">Confetti, sparkles, transitions</div>
              </div>
              <span className={`toggle ${state.settings.animations ? "on" : "off"}`}></span>
            </button>

            <div className="ps-perf-card">
              <div className="ps-group-title">Performance (Session p95)</div>
              <div className="ps-perf-list">
                {(Object.keys(PERF_LABELS) as PerfBucket[]).map((bucket) => {
                  const stats = perfStats[bucket];
                  const target = PERF_TARGETS_MS[bucket];
                  const isWithinTarget = stats.count === 0 || stats.p95Ms <= target;

                  return (
                    <div key={bucket} className={`ps-perf-row ${isWithinTarget ? "ok" : "slow"}`}>
                      <div className="ps-perf-metric">
                        <span>{PERF_LABELS[bucket]}</span>
                        <small>target {target}ms</small>
                      </div>
                      <div className="ps-perf-values">
                        <strong>{stats.p95Ms}ms</strong>
                        <small>{stats.count} samples</small>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <section className="ps-danger-zone">
              <div className="ps-danger-title">Danger Zone</div>
              <button type="button" className="ps-danger-btn" onClick={() => void resetHousehold()} disabled={isDemoMode}>
                {isResetConfirming ? "Tap Again to Confirm Reset" : "Reset Household"}
              </button>
              <button type="button" className="ps-danger-cancel" onClick={logout}>
                Logout
              </button>
              {isResetConfirming ? (
                <button type="button" className="ps-danger-cancel" onClick={() => setIsResetConfirming(false)}>
                  Cancel
                </button>
              ) : null}
            </section>
          </section> : null}
        </div>
      </article>
    );
  };

  const renderParentView = () => {
    if (!canAccessParent) {
      return (
        <section className="parent-screen">
          <div className="parent-shell">
            <article className="phone-frame">
              <div className="p-body">
                <div className="setting-row">Parent role required to access admin controls.</div>
              </div>
            </article>
          </div>
        </section>
      );
    }

    let body: ReactNode = renderParentHome();
    if (state.parentScreen === "award") body = renderParentAward() ?? renderParentHome();
    if (state.parentScreen === "payday") body = renderParentPayday();
    if (state.parentScreen === "redemptions") body = renderParentRedemptions();
    if (state.parentScreen === "settings") body = renderParentSettings();

    return (
      <section className="parent-screen">
        <div className={`parent-shell ${state.parentScreen === "settings" ? "parent-shell-settings" : ""}`}>{body}</div>
      </section>
    );
  };

  const redeemModal =
    state.modal && state.modal.type === "redeem"
      ? (() => {
          const child = childById.get(state.modal.childId);
          const reward = rewardById.get(state.modal.rewardId);
          if (!child || !reward) return null;

          const remaining = child.coins - reward.cost;

          return (
            <div className="modal-backdrop" onClick={closeModal}>
              <div
                className="redeem-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="redeem-title"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="redeem-icon">{reward.icon}</div>
                <h2 className="redeem-title" id="redeem-title">
                  {reward.name}
                </h2>
                <div className="redeem-desc">{reward.desc}</div>
                <div className="modal-cost-wrap">
                  <RewardCostChip cost={reward.cost} affordable={true} />
                </div>
                <div className="redeem-after">
                  You&apos;ll have <strong>{remaining} coins</strong> left
                </div>
                <div className="redeem-actions">
                  <button type="button" className="redeem-cancel" onClick={closeModal}>
                    Not Now
                  </button>
                  <button
                    type="button"
                    className="redeem-confirm"
                    onClick={() => {
                      const source = document.querySelector<HTMLElement>(
                        `.store-panel.${state.modal?.childId ?? ""} .chip-balance`,
                      );
                      confirmRedeem(source);
                    }}
                  >
                    Get It! 🎉
                  </button>
                </div>
              </div>
            </div>
          );
        })()
      : null;

  if (!bootReady) {
    return (
      <div className="auth-shell min-h-screen">
        <div className="auth-card">
          <div className="auth-title">Loading household...</div>
          <div className="auth-subtitle">Fetching board and rewards data.</div>
        </div>
      </div>
    );
  }

  if (bootError) {
    return (
      <div className="auth-shell min-h-screen">
        <div className="auth-card">
          <div className="auth-title">Unable to load app</div>
          <div className="auth-error">{bootError}</div>
          <button type="button" className="auth-submit" onClick={() => router.refresh()}>
            Try Again
          </button>
          <button type="button" className="auth-demo-link" onClick={() => router.push("/auth")}>
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <svg xmlns="http://www.w3.org/2000/svg" className="sprite" aria-hidden="true">
        <defs>
          <symbol id="coin" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="11" fill="#F5C843" stroke="#C99A0C" strokeWidth="1.2"></circle>
            <circle cx="12" cy="12" r="8.5" fill="none" stroke="#E8B520" strokeWidth="0.8" opacity="0.6"></circle>
            <circle cx="12" cy="12" r="5.5" fill="none" stroke="#DCAA12" strokeWidth="0.6" opacity="0.4"></circle>
            <text
              x="12"
              y="16"
              textAnchor="middle"
              fontFamily="Fredoka, sans-serif"
              fontWeight="700"
              fontSize="10"
              fill="#B8860B"
              opacity="0.8"
            >
              ¢
            </text>
          </symbol>
          <symbol id="star-claimed" viewBox="0 0 24 24">
            <path
              d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.27 5.82 22 7 14.14 2 9.27l6.91-1.01L12 2z"
              fill="#F5B83D"
              stroke="#C98B08"
              strokeWidth="0.8"
            ></path>
          </symbol>
          <symbol id="star-pending" viewBox="0 0 24 24">
            <path
              d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.27 5.82 22 7 14.14 2 9.27l6.91-1.01L12 2z"
              fill="none"
              stroke="#F5B83D"
              strokeWidth="1.8"
            ></path>
          </symbol>
          <symbol id="star-bonus" viewBox="0 0 24 24">
            <path
              d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.27 5.82 22 7 14.14 2 9.27l6.91-1.01L12 2z"
              fill="#FF9F43"
              stroke="#E0872A"
              strokeWidth="0.8"
            ></path>
          </symbol>
          <symbol id="lucide-calendar" viewBox="0 0 24 24">
            <rect width="18" height="18" x="3" y="4" rx="2" ry="2"></rect>
            <line x1="16" x2="16" y1="2" y2="6"></line>
            <line x1="8" x2="8" y1="2" y2="6"></line>
            <line x1="3" x2="21" y1="10" y2="10"></line>
          </symbol>
          <symbol id="lucide-trending-up" viewBox="0 0 24 24">
            <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"></polyline>
            <polyline points="16 7 22 7 22 13"></polyline>
          </symbol>
          <symbol id="lucide-key-round" viewBox="0 0 24 24">
            <path d="M15.5 7.5a4.5 4.5 0 1 0-4.3 6H22"></path>
            <path d="M18 12v4"></path>
            <path d="M15 12v4"></path>
          </symbol>
          <symbol id="lucide-volume-2" viewBox="0 0 24 24">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
          </symbol>
          <symbol id="lucide-sparkles" viewBox="0 0 24 24">
            <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"></path>
            <path d="M5 3v4"></path>
            <path d="M19 17v4"></path>
            <path d="M3 5h4"></path>
            <path d="M17 19h4"></path>
          </symbol>
          <symbol id="lucide-chevron-right" viewBox="0 0 24 24">
            <path d="m9 18 6-6-6-6"></path>
          </symbol>
          <symbol id="lucide-archive" viewBox="0 0 24 24">
            <rect width="20" height="5" x="2" y="3" rx="1"></rect>
            <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"></path>
            <path d="M10 12h4"></path>
          </symbol>
          <symbol id="lucide-x" viewBox="0 0 24 24">
            <path d="M18 6 6 18"></path>
            <path d="m6 6 12 12"></path>
          </symbol>
          <symbol id="lucide-trash-2" viewBox="0 0 24 24">
            <path d="M3 6h18"></path>
            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
            <line x1="10" x2="10" y1="11" y2="17"></line>
            <line x1="14" x2="14" y1="11" y2="17"></line>
          </symbol>
          <symbol id="lucide-grip-vertical" viewBox="0 0 24 24">
            <circle cx="9" cy="12" r="1"></circle>
            <circle cx="9" cy="5" r="1"></circle>
            <circle cx="9" cy="19" r="1"></circle>
            <circle cx="15" cy="12" r="1"></circle>
            <circle cx="15" cy="5" r="1"></circle>
            <circle cx="15" cy="19" r="1"></circle>
          </symbol>
          <symbol id="lucide-chevron-left" viewBox="0 0 24 24">
            <path d="m15 18-6-6 6-6"></path>
          </symbol>
        </defs>
      </svg>

      <motion.div
        className="app-shell min-h-screen"
        style={appThemeVars}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
      >
        {state.view === "parent" ? (
          <div className="admin-status-stack" role="status" aria-live="polite">
            {showAdminLoadingToast ? <div className="admin-status-toast">Loading settings...</div> : null}
            {isSavingChoreOrder ? <div className="admin-status-toast">Saving chore order...</div> : null}
            {isSavingRewardOrder ? <div className="admin-status-toast">Saving reward order...</div> : null}
            {isCreatingChild ? <div className="admin-status-toast">Creating child profile...</div> : null}
            {savingChildId ? <div className="admin-status-toast">Saving child profile...</div> : null}
            {savingSharedChoreSlug ? <div className="admin-status-toast">Saving chore details...</div> : null}
            {isCreatingChore ? <div className="admin-status-toast">Creating chore...</div> : null}
            {savingRewardId ? <div className="admin-status-toast">Saving reward details...</div> : null}
            {isCreatingReward ? <div className="admin-status-toast">Creating reward...</div> : null}
            {isSavingHouseholdSettings ? <div className="admin-status-toast">Saving household settings...</div> : null}
            {adminNotice ? <div className="admin-status-toast is-success">{adminNotice}</div> : null}
            {adminError ? <div className="admin-status-toast is-error">{adminError}</div> : null}
            {apiError ? (
              <div className="admin-status-toast is-error">
                <span>{apiError}</span>
                <button type="button" onClick={clearApiError}>
                  Dismiss
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        <main className="view-root" aria-live="polite">
          {state.view === "kids" ? renderKidsView() : state.view === "store" ? renderStoreView() : renderParentView()}
        </main>
      </motion.div>

      {redeemModal}
    </>
  );
}
