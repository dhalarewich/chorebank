"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { applyLiveBoardToState } from "@/lib/chore-board/hydrate";
import { createInitialState, DAYS, REWARDS } from "@/lib/chore-board/defaults";
import type {
  AppState,
  AwardToast,
  Child,
  ChildId,
  FallingCoin,
  LastClaim,
  Reward,
  StarCellState,
} from "@/types/chore-board";
import type { LiveBoardPayload } from "@/types/live-api";

function getChild(children: Child[], childId: ChildId): Child | undefined {
  return children.find((child) => child.id === childId);
}

function getReward(rewards: Reward[], rewardId: string): Reward | undefined {
  return rewards.find((reward) => reward.id === rewardId);
}

function getStarCounts(child: Child): { claimed: number; pending: number; total: number } {
  let claimed = 0;
  let pending = 0;

  child.chores.forEach((chore) => {
    chore.cells.forEach((state) => {
      if (state === "claimed") claimed += 1;
      if (state === "pending") pending += 1;
    });
  });

  child.bonus.forEach((state) => {
    if (state === "claimed") claimed += 1;
    if (state === "pending") pending += 1;
  });

  return { claimed, pending, total: claimed + pending };
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

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < 2 * minute) return "Just now";
  if (diff < hour) return `${Math.floor(diff / minute)} min ago`;
  if (diff < day) {
    const value = Math.floor(diff / hour);
    return value === 1 ? "1 hour ago" : `${value} hours ago`;
  }

  const days = Math.floor(diff / day);
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

function createFallingCoins(seed: number): FallingCoin[] {
  const count = 28;
  let source = seed % 2147483647;
  const next = () => {
    source = (source * 16807) % 2147483647;
    return (source - 1) / 2147483646;
  };

  return Array.from({ length: count }).map((_, idx) => {
    const depthRoll = next();
    const depthClass = depthRoll < 0.28 ? "near" : depthRoll < 0.72 ? "mid" : "far";
    const left = next() * 100;
    const duration = depthClass === "near" ? 6 + next() * 5 : depthClass === "mid" ? 8 + next() * 6 : 11 + next() * 7;
    const delay = next() * 6;
    const drift = (next() - 0.5) * 34;
    const scale = depthClass === "near" ? 1.28 + next() * 0.34 : depthClass === "mid" ? 0.95 + next() * 0.24 : 0.72 + next() * 0.2;

    return {
      id: `${seed}-${idx}`,
      depthClass,
      left,
      duration,
      delay,
      drift,
      scale,
    };
  });
}

type MutableAudio = {
  context: AudioContext | null;
  unlocked: boolean;
};

type CountField = "stars" | "interest" | "balance";

function parseApiErrorMessage(errorBody: unknown, status: number): string {
  if (
    errorBody &&
    typeof errorBody === "object" &&
    "error" in errorBody &&
    typeof (errorBody as { error?: unknown }).error === "string"
  ) {
    return (errorBody as { error: string }).error;
  }

  if (status === 401) return "Sign in required. Please log in again.";
  if (status === 403) return "You do not have permission for this action.";
  return `Request failed (${status})`;
}

export function useChoreBoardApp(options?: { liveApi?: boolean; onAuthError?: () => void }) {
  const liveApi = options?.liveApi ?? false;
  const onAuthError = options?.onAuthError;
  const [state, setState] = useState<AppState>(createInitialState);
  const [rewards, setRewards] = useState<Reward[]>(REWARDS);
  const [apiError, setApiError] = useState<string | null>(null);
  const stateRef = useRef(state);
  const timeoutsRef = useRef<number[]>([]);
  const rafsRef = useRef<number[]>([]);
  const audioRef = useRef<MutableAudio>({ context: null, unlocked: false });

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const timeoutIds = timeoutsRef.current;
    const rafIds = rafsRef.current;

    return () => {
      timeoutIds.forEach((id) => window.clearTimeout(id));
      rafIds.forEach((id) => window.cancelAnimationFrame(id));
    };
  }, []);

  const updateState = useCallback((recipe: (draft: AppState) => void) => {
    setState((prev) => {
      const draft = structuredClone(prev) as AppState;
      recipe(draft);
      return draft;
    });
  }, []);

  const queueTimeout = useCallback((fn: () => void, delay: number) => {
    const id = window.setTimeout(fn, delay);
    timeoutsRef.current.push(id);
    return id;
  }, []);

  const reportActionError = useCallback((error: unknown) => {
    const fallback = "Something went wrong. Please try again.";
    if (error instanceof Error) {
      setApiError(error.message || fallback);
      return;
    }
    setApiError(fallback);
  }, []);

  const applyLiveBoard = useCallback((board: LiveBoardPayload) => {
    setState((prev) => applyLiveBoardToState(prev, board));
  }, []);

  const syncLiveMutation = useCallback(
    async (path: string, body: Record<string, unknown>, method: "POST" | "PATCH" = "POST") => {
      const response = await fetch(path, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        if (response.status === 401 && onAuthError) {
          onAuthError();
        }
        throw new Error(parseApiErrorMessage(errorBody, response.status));
      }

      const payload = (await response.json()) as { state?: LiveBoardPayload };
      if (payload.state) {
        applyLiveBoard(payload.state);
      }
    },
    [applyLiveBoard, onAuthError],
  );

  const refreshLiveBoard = useCallback(async () => {
    const response = await fetch("/api/board", { cache: "no-store" });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      if (response.status === 401 && onAuthError) {
        onAuthError();
      }
      throw new Error(parseApiErrorMessage(errorBody, response.status));
    }

    const payload = (await response.json()) as { state?: LiveBoardPayload };
    if (payload.state) {
      applyLiveBoard(payload.state);
    }
  }, [applyLiveBoard, onAuthError]);

  const refreshLiveRewards = useCallback(async () => {
    const response = await fetch("/api/rewards", { cache: "no-store" });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      if (response.status === 401 && onAuthError) {
        onAuthError();
      }
      throw new Error(parseApiErrorMessage(errorBody, response.status));
    }

    const payload = (await response.json()) as { rewards?: Reward[] };
    if (payload.rewards) {
      setRewards(payload.rewards);
    }
  }, [onAuthError]);

  const ensureContext = useCallback(() => {
    const store = audioRef.current;
    if (!store.context) {
      const AudioCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) return null;
      store.context = new AudioCtor();
    }
    return store.context;
  }, []);

  const unlockSound = useCallback(() => {
    const store = audioRef.current;
    if (!stateRef.current.settings.sounds || store.unlocked) return;

    const ctx = ensureContext();
    if (!ctx) return;

    if (ctx.state === "suspended") {
      void ctx.resume();
    }

    store.unlocked = true;
  }, [ensureContext]);

  const tone = useCallback((freq: number, duration: number, type: OscillatorType = "sine", gainValue = 0.035, delay = 0) => {
    if (!stateRef.current.settings.sounds) return;
    const ctx = ensureContext();
    if (!ctx) return;

    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(gainValue, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }, [ensureContext]);

  const soundAction = useCallback(() => {
    unlockSound();
    tone(760, 0.11, "triangle", 0.03);
    tone(960, 0.12, "triangle", 0.025, 0.08);
  }, [tone, unlockSound]);

  const soundClaimStar = useCallback(() => {
    unlockSound();
    tone(520, 0.2, "sine", 0.015, 0);
    tone(740, 0.2, "triangle", 0.03, 0.07);
    tone(980, 0.22, "triangle", 0.03, 0.18);
    tone(1320, 0.26, "triangle", 0.03, 0.32);
    tone(1560, 0.24, "sine", 0.02, 0.48);
  }, [tone, unlockSound]);

  const soundPayout = useCallback(() => {
    unlockSound();
    tone(460, 0.16, "sine", 0.028);
    tone(620, 0.18, "sine", 0.028, 0.12);
    tone(810, 0.2, "sine", 0.028, 0.24);
  }, [tone, unlockSound]);

  const soundPaydayFinale = useCallback(() => {
    unlockSound();
    tone(420, 0.2, "triangle", 0.022, 0);
    tone(560, 0.22, "triangle", 0.024, 0.09);
    tone(720, 0.24, "triangle", 0.026, 0.2);
    tone(920, 0.26, "triangle", 0.028, 0.32);
    tone(1180, 0.3, "sine", 0.026, 0.45);
    tone(1480, 0.34, "sine", 0.024, 0.6);
    tone(1760, 0.44, "sine", 0.022, 0.76);
  }, [tone, unlockSound]);

  const soundInterest = useCallback(() => {
    unlockSound();
    tone(980, 0.08, "triangle", 0.02);
    tone(1240, 0.1, "triangle", 0.02, 0.06);
  }, [tone, unlockSound]);

  const soundRedeem = useCallback(() => {
    unlockSound();
    tone(690, 0.12, "triangle", 0.032);
    tone(920, 0.13, "triangle", 0.028, 0.1);
  }, [tone, unlockSound]);

  const soundCoinTap = useCallback(() => {
    unlockSound();
    // Mario-style coin chirp: two distinct notes (B5 -> E6).
    tone(987.766, 0.1, "square", 0.045, 0);

    // Longer second note with a light sustain hold.
    if (stateRef.current.settings.sounds) {
      const ctx = ensureContext();
      if (ctx) {
        const start = ctx.currentTime + 0.085;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "square";
        osc.frequency.setValueAtTime(1318.51, start);

        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.04, start + 0.012);
        gain.gain.setValueAtTime(0.034, start + 0.09); // subtle sustain plateau
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.26);

        osc.connect(gain).connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.28);
      }
    }

    // Small harmonic sparkle to keep it bright on tablet speakers.
    tone(1975.533, 0.1, "sine", 0.01, 0.11);
  }, [ensureContext, tone, unlockSound]);

  const soundStoreDoorChime = useCallback(() => {
    unlockSound();
    tone(720, 0.18, "triangle", 0.02, 0);
    tone(960, 0.22, "sine", 0.022, 0.14);
    tone(1260, 0.24, "sine", 0.018, 0.3);
  }, [tone, unlockSound]);

  const spawnSparkles = useCallback((target: HTMLElement) => {
    if (!stateRef.current.settings.animations) return;

    const rect = target.getBoundingClientRect();
    const originX = rect.left + rect.width / 2;
    const originY = rect.top + rect.height / 2;

    const ring = document.createElement("span");
    ring.className = "claim-ring";
    ring.style.left = `${originX}px`;
    ring.style.top = `${originY}px`;
    document.body.appendChild(ring);
    queueTimeout(() => ring.remove(), 920);

    for (let index = 0; index < 14; index += 1) {
      const angle = (Math.PI * 2 * index) / 14 + Math.random() * 0.24;
      const distance = 26 + Math.random() * 56;
      const dx = Math.cos(angle) * distance;
      const dy = Math.sin(angle) * distance - 18;
      const spark = document.createElement("span");
      spark.className = "sparkle";
      spark.style.setProperty("--size", `${8 + Math.random() * 7}px`);
      spark.style.left = `${originX}px`;
      spark.style.top = `${originY}px`;
      spark.style.setProperty("--sx", `${dx}px`);
      spark.style.setProperty("--sy", `${dy}px`);
      document.body.appendChild(spark);
      queueTimeout(() => spark.remove(), 980);
    }

    for (let index = 0; index < 4; index += 1) {
      const glyph = document.createElement("span");
      glyph.className = "sparkle sparkle-glyph";
      glyph.textContent = "✨";
      glyph.style.left = `${originX}px`;
      glyph.style.top = `${originY}px`;
      glyph.style.setProperty("--sx", `${(Math.random() - 0.5) * 82}px`);
      glyph.style.setProperty("--sy", `${-34 - Math.random() * 52}px`);
      document.body.appendChild(glyph);
      queueTimeout(() => glyph.remove(), 1020);
    }
  }, [queueTimeout]);

  const spawnRewardBurst = useCallback((target: HTMLElement, count = 8) => {
    if (!stateRef.current.settings.animations) return;

    const rect = target.getBoundingClientRect();
    const originX = rect.left + rect.width / 2;
    const originY = rect.top + rect.height / 2;

    for (let index = 0; index < count; index += 1) {
      const burst = document.createElement("span");
      burst.className = "reward-burst";
      burst.style.left = `${originX}px`;
      burst.style.top = `${originY}px`;
      burst.style.setProperty("--tx", `${(Math.random() - 0.5) * 90}px`);
      burst.style.setProperty("--ty", `${(Math.random() - 0.5) * 90}px`);
      document.body.appendChild(burst);
      queueTimeout(() => burst.remove(), 420);
    }
  }, [queueTimeout]);

  const spawnSpendCoins = useCallback((target: HTMLElement, cost: number) => {
    if (!stateRef.current.settings.animations) return;

    const rect = target.getBoundingClientRect();
    const originX = rect.left + rect.width * 0.76;
    const originY = rect.top + rect.height * 0.48;
    const count = Math.max(3, Math.min(8, Math.round(cost / 12)));

    for (let index = 0; index < count; index += 1) {
      const coin = document.createElement("span");
      coin.className = "reward-spend-coin";
      coin.style.left = `${originX}px`;
      coin.style.top = `${originY}px`;
      coin.style.setProperty("--tx", `${24 + Math.random() * 64}px`);
      coin.style.setProperty("--ty", `${(Math.random() - 0.5) * 44}px`);
      coin.style.animationDelay = `${index * 36}ms`;
      coin.innerHTML = `<svg viewBox=\"0 0 24 24\"><use href=\"#coin\"></use></svg>`;
      document.body.appendChild(coin);
      queueTimeout(() => coin.remove(), 760);
    }
  }, [queueTimeout]);

  const spawnPaydayFinaleBurst = useCallback((childId: ChildId) => {
    if (!stateRef.current.settings.animations) return;

    const target = document.querySelector<HTMLElement>(`[data-count-balance="${childId}"]`);
    if (!target) return;

    const rect = target.getBoundingClientRect();
    const originX = rect.left + rect.width / 2;
    const originY = rect.top + rect.height / 2;

    const ring = document.createElement("span");
    ring.className = "payday-finale-ring";
    ring.style.left = `${originX}px`;
    ring.style.top = `${originY}px`;
    document.body.appendChild(ring);
    queueTimeout(() => ring.remove(), 1100);

    const burstCount = 34;

    for (let index = 0; index < burstCount; index += 1) {
      const angle = (Math.PI * 2 * index) / burstCount + (Math.random() - 0.5) * 0.25;
      const distance = 88 + Math.random() * 180;
      const lift = 42 + Math.random() * 74;

      const piece = document.createElement("span");
      const roll = Math.random();

      if (roll > 0.84) {
        piece.className = "payday-confetti coin";
        piece.innerHTML = `<svg viewBox=\"0 0 24 24\"><use href=\"#coin\"></use></svg>`;
      } else if (roll > 0.68) {
        piece.className = "payday-confetti star";
        piece.textContent = "✨";
      } else {
        piece.className = "payday-confetti";
        piece.style.setProperty("--hue", `${Math.round(24 + Math.random() * 44)}`);
      }

      piece.style.left = `${originX}px`;
      piece.style.top = `${originY}px`;
      piece.style.setProperty("--tx", `${Math.cos(angle) * distance}px`);
      piece.style.setProperty("--ty", `${Math.sin(angle) * distance - lift}px`);
      piece.style.setProperty("--rot", `${(Math.random() - 0.5) * 680}deg`);
      piece.style.setProperty("--delay", `${Math.round(Math.random() * 140)}ms`);

      document.body.appendChild(piece);
      queueTimeout(() => piece.remove(), 1500);
    }
  }, [queueTimeout]);

  const spawnPaydayCoins = useCallback((stage: HTMLElement, count: number, startDelay: number, isInterest: boolean) => {
    if (count <= 0) return;

    const stageWidth = Math.max(260, stage.clientWidth || 420);
    const stageHeight = Math.max(190, stage.clientHeight || 240);
    const coinSize = Math.max(26, Math.min(46, Math.round(stageHeight * 0.16)));
    const cols = Math.max(6, Math.min(10, Math.floor(stageWidth / (coinSize * 0.82))));
    const rows = Math.max(4, Math.ceil(count / cols));

    for (let index = 0; index < count; index += 1) {
      const coin = document.createElement("span");
      coin.className = `payday-coin${isInterest ? " interest" : ""}`;

      const row = Math.floor(index / cols);
      const col = index % cols;
      const xBase = (col - (cols - 1) / 2) * (coinSize * 0.76);
      const xJitter = (Math.random() - 0.5) * (coinSize * 0.34);
      const clampedRow = Math.min(row, rows + 1);
      const yBase = stageHeight - coinSize - clampedRow * (coinSize * 0.34);
      const yJitter = (Math.random() - 0.5) * (coinSize * 0.22);

      coin.style.setProperty("--coin-size", `${coinSize}px`);
      coin.style.setProperty("--sx", `${(Math.random() - 0.5) * stageWidth * 0.62}px`);
      coin.style.setProperty("--tx", `${xBase + xJitter}px`);
      coin.style.setProperty("--ty", `${yBase + yJitter}px`);
      coin.style.setProperty("--r1", `${(Math.random() - 0.5) * 260}deg`);
      coin.style.setProperty("--r2", `${(Math.random() - 0.5) * 18}deg`);
      coin.style.animationDelay = `${startDelay + index * (isInterest ? 120 : 48)}ms`;
      coin.innerHTML = `<svg viewBox=\"0 0 24 24\"><use href=\"#coin\"></use></svg>`;

      stage.appendChild(coin);
    }
  }, []);

  const animatePaydayCoinStage = useCallback((childId: ChildId, stars: number, interest: number) => {
    const stage = document.querySelector<HTMLElement>(`[data-coin-stage="${childId}"]`);
    if (!stage) return;

    const earned = stars + interest;
    const visualTotal = Math.min(earned, 28);
    const visualInterest = earned > 0 ? Math.min(6, Math.max(interest > 0 ? 1 : 0, Math.round((interest / earned) * visualTotal))) : 0;
    const visualStars = Math.max(0, visualTotal - visualInterest);

    stage.querySelectorAll(".payday-coin").forEach((coin) => coin.remove());

    if (!stateRef.current.settings.animations) {
      const staticCount = Math.max(1, Math.min(8, visualTotal));
      spawnPaydayCoins(stage, staticCount, 0, false);
      return;
    }

    spawnPaydayCoins(stage, visualStars, 120, false);
    spawnPaydayCoins(stage, visualInterest, 980, true);
  }, [spawnPaydayCoins]);

  const animateCelebrationCount = useCallback((childId: ChildId, field: CountField, from: number, to: number, duration: number) => {
    if (!stateRef.current.settings.animations) {
      updateState((draft) => {
        draft.celebrationVisuals[childId][field] = to;
      });
      return;
    }

    const start = performance.now();

    const frame = (nowTime: number) => {
      const progress = Math.min((nowTime - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = Math.round(from + (to - from) * eased);

      setState((prev) => {
        const draft = structuredClone(prev) as AppState;
        draft.celebrationVisuals[childId][field] = value;
        return draft;
      });

      if (progress < 1) {
        const nextRaf = window.requestAnimationFrame(frame);
        rafsRef.current.push(nextRaf);
      }
    };

    const raf = window.requestAnimationFrame(frame);
    rafsRef.current.push(raf);
  }, [updateState]);

  const runCelebrationSequence = useCallback(() => {
    const current = stateRef.current;
    if (current.celebrationPlayed || current.kidsScreen !== "celebration") return;

    updateState((draft) => {
      draft.celebrationPlayed = true;
    });

    const latest = stateRef.current;

    if (!latest.settings.animations) {
      updateState((draft) => {
        (Object.keys(draft.paydaySummary) as ChildId[]).forEach((childId) => {
          const summary = draft.paydaySummary[childId];
          draft.celebrationVisuals[childId] = {
            showStars: true,
            showInterest: true,
            stars: summary.stars,
            interest: summary.interest,
            balance: summary.newBalance,
          };
        });
      });

      (Object.keys(latest.paydaySummary) as ChildId[]).forEach((childId) => {
        const summary = latest.paydaySummary[childId];
        animatePaydayCoinStage(childId, summary.stars, summary.interest);
      });
      return;
    }

    (Object.keys(latest.paydaySummary) as ChildId[]).forEach((childId) => {
      const summary = latest.paydaySummary[childId];

      queueTimeout(() => {
        updateState((draft) => {
          draft.celebrationVisuals[childId].showStars = true;
        });
        animateCelebrationCount(childId, "stars", 0, summary.stars, 650);
        animatePaydayCoinStage(childId, summary.stars, summary.interest);
        soundAction();
      }, 200);

      queueTimeout(() => {
        updateState((draft) => {
          draft.celebrationVisuals[childId].showInterest = true;
        });
        animateCelebrationCount(childId, "interest", 0, summary.interest, 520);
        soundInterest();
      }, 950);

      queueTimeout(() => {
        animateCelebrationCount(childId, "balance", summary.carried, summary.newBalance, 760);
        soundPaydayFinale();
        spawnPaydayFinaleBurst(childId);
      }, 1650);
    });
  }, [animateCelebrationCount, animatePaydayCoinStage, queueTimeout, soundAction, soundInterest, soundPaydayFinale, spawnPaydayFinaleBurst, updateState]);

  const setCellState = useCallback((draft: AppState, childId: ChildId, rowId: string, day: number, isBonus: boolean, nextState: StarCellState) => {
    const child = getChild(draft.children, childId);
    if (!child) return;

    if (isBonus || rowId === "bonus") {
      child.bonus[day] = nextState;
      return;
    }

    const row = child.chores.find((chore) => chore.id === rowId);
    if (!row) return;

    row.cells[day] = nextState;
  }, []);

  const previewPayday = useCallback((child: Child, interestRate: number) => {
    const carried = child.coins;
    const stars = countClaimedStars(child);
    const interest = Math.round((carried * interestRate) / 100);
    const newBalance = carried + interest + stars;
    return { carried, stars, interest, newBalance };
  }, []);

  const finalizeWeekCells = useCallback((child: Child) => {
    child.chores.forEach((chore) => {
      chore.cells = chore.cells.map((cell) => {
        if (cell === "future" || cell === "pending") return "empty";
        return cell;
      });
    });

    child.bonus = child.bonus.map((cell) => {
      if (cell === "future" || cell === "pending") return "empty";
      return cell;
    });
  }, []);

  const isLatestClaim = useCallback((childId: ChildId, rowId: string, day: number, isBonus: boolean) => {
    const last = state.lastClaim;
    if (!last) return false;
    const fresh = Date.now() - last.at < 1200;
    return fresh && last.childId === childId && last.rowId === rowId && last.day === day && last.isBonus === isBonus;
  }, [state.lastClaim]);

  const claimStar = useCallback(
    (target: HTMLElement, childId: ChildId, rowId: string, day: number, isBonus: boolean) => {
      spawnSparkles(target);
      soundClaimStar();

      updateState((draft) => {
        const nextLastClaim: LastClaim = { childId, rowId, day, isBonus, at: Date.now() };
        draft.lastClaim = nextLastClaim;
      });

      if (liveApi) {
        void syncLiveMutation("/api/stars/claim", { childId, rowId, day, isBonus }).catch((error) => {
          reportActionError(error);
        });
        return;
      }

      updateState((draft) => {
        setCellState(draft, childId, rowId, day, isBonus, "claimed");
      });
    },
    [liveApi, reportActionError, setCellState, soundClaimStar, spawnSparkles, syncLiveMutation, updateState],
  );

  const switchKid = useCallback((childId: ChildId) => {
    updateState((draft) => {
      draft.narrowChildId = childId;
    });
  }, [updateState]);

  const switchStoreKid = useCallback((childId: ChildId) => {
    updateState((draft) => {
      draft.storeNarrowChildId = childId;
    });
  }, [updateState]);

  const gotoStore = useCallback((childId?: ChildId) => {
    updateState((draft) => {
      draft.view = "store";
      if (childId) draft.storeNarrowChildId = childId;
    });
  }, [updateState]);

  const gotoKids = useCallback(() => {
    updateState((draft) => {
      draft.view = "kids";
    });
  }, [updateState]);

  const seePayday = useCallback(() => {
    if (liveApi) {
      void syncLiveMutation("/api/payday/screen", { screen: "celebration" }, "PATCH").catch((error) => {
        reportActionError(error);
      });
      return;
    }

    updateState((draft) => {
      draft.kidsScreen = "celebration";
      draft.celebrationPlayed = false;
      draft.celebrationSeed = Date.now();
      (Object.keys(draft.celebrationVisuals) as ChildId[]).forEach((childId) => {
        const summary = draft.paydaySummary[childId];
        draft.celebrationVisuals[childId] = {
          showStars: false,
          showInterest: false,
          stars: 0,
          interest: 0,
          balance: summary.carried,
        };
      });
    });
  }, [liveApi, reportActionError, syncLiveMutation, updateState]);

  const closePayday = useCallback(() => {
    if (liveApi) {
      void syncLiveMutation("/api/payday/screen", { screen: "closed" }, "PATCH").catch((error) => {
        reportActionError(error);
      });
      return;
    }

    updateState((draft) => {
      draft.kidsScreen = "closed";
      draft.view = "kids";
    });
  }, [liveApi, reportActionError, syncLiveMutation, updateState]);

  const openRedeem = useCallback((childId: ChildId, rewardId: string) => {
    updateState((draft) => {
      draft.modal = { type: "redeem", childId, rewardId };
    });
  }, [updateState]);

  const closeModal = useCallback(() => {
    updateState((draft) => {
      draft.modal = null;
    });
  }, [updateState]);

  const addRedemption = useCallback((draft: AppState, childId: ChildId, rewardId: string) => {
    const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? `r-${crypto.randomUUID()}` : `r-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    draft.redemptions.unshift({
      id,
      childId,
      rewardId,
      createdAt: Date.now(),
      status: "pending",
    });
  }, []);

  const confirmRedeem = useCallback((source: HTMLElement | null) => {
    const modal = stateRef.current.modal;
    if (!modal || modal.type !== "redeem") return;

    const reward = getReward(rewards, modal.rewardId);
    if (!reward) return;

    if (liveApi) {
      updateState((draft) => {
        draft.modal = null;
      });
      void syncLiveMutation("/api/redemptions/request", { childId: modal.childId, rewardId: modal.rewardId }).catch((error) => {
        reportActionError(error);
      });
    } else {
      updateState((draft) => {
        const child = getChild(draft.children, modal.childId);
        if (!child || child.coins < reward.cost) {
          draft.modal = null;
          return;
        }

        child.coins -= reward.cost;
        addRedemption(draft, child.id, reward.id);
        draft.modal = null;
      });
    }

    if (source) {
      spawnRewardBurst(source, 6);
      spawnSpendCoins(source, reward.cost);
    }

    soundRedeem();
  }, [addRedemption, liveApi, reportActionError, rewards, soundRedeem, spawnRewardBurst, spawnSpendCoins, syncLiveMutation, updateState]);

  const parentGo = useCallback((screen: AppState["parentScreen"]) => {
    updateState((draft) => {
      draft.view = "parent";
      draft.parentScreen = screen;
    });
  }, [updateState]);

  const parentSelectChild = useCallback((childId: ChildId) => {
    updateState((draft) => {
      draft.parentSelectedChildId = childId;
      const child = getChild(draft.children, childId);
      if (child) {
        draft.parentSelectedChoreId = child.chores[0]?.id ?? "";
      }
    });
  }, [updateState]);

  const parentSelectChore = useCallback((choreId: string) => {
    updateState((draft) => {
      draft.parentSelectedChoreId = choreId;
    });
  }, [updateState]);

  const parentSelectDay = useCallback((day: number) => {
    updateState((draft) => {
      draft.parentSelectedDay = day;
    });
  }, [updateState]);

  const awardSelected = useCallback((isBonus: boolean) => {
    const current = stateRef.current;
    const child = getChild(current.children, current.parentSelectedChildId);
    if (!child) return;

    const day = current.parentSelectedDay;
    if (day > current.currentDay) return;

    let rowId: string;
    let rowLabel: string;
    let previous: StarCellState;

    if (isBonus) {
      rowId = "bonus";
      rowLabel = "Bonus";
      previous = child.bonus[day];
      if (previous === "pending" || previous === "claimed") return;
    } else {
      rowId = current.parentSelectedChoreId;
      const row = child.chores.find((chore) => chore.id === rowId);
      if (!row) return;
      rowLabel = row.label;
      previous = row.cells[day];
      if (previous === "pending" || previous === "claimed") return;
    }

    if (liveApi) {
      void syncLiveMutation("/api/stars/award", {
        childId: current.parentSelectedChildId,
        rowId,
        day,
        isBonus,
      }).catch((error) => {
        reportActionError(error);
      });

      updateState((draft) => {
        const toast: AwardToast = {
          childId: current.parentSelectedChildId,
          childName: child.name,
          rowId,
          choreLabel: rowLabel,
          previous,
          day,
          dayLabel: DAYS[day].label,
          at: Date.now(),
        };
        draft.awardToast = toast;
      });
    } else {
      updateState((draft) => {
        const draftChild = getChild(draft.children, draft.parentSelectedChildId);
        if (!draftChild) return;

        if (isBonus) {
          draftChild.bonus[day] = "pending";
        } else {
          const row = draftChild.chores.find((chore) => chore.id === rowId);
          if (!row) return;
          row.cells[day] = "pending";
        }

        const toast: AwardToast = {
          childId: draftChild.id,
          childName: draftChild.name,
          rowId,
          choreLabel: rowLabel,
          previous,
          day,
          dayLabel: DAYS[day].label,
          at: Date.now(),
        };
        draft.awardToast = toast;
      });
    }

    soundAction();

    queueTimeout(() => {
      const toast = stateRef.current.awardToast;
      if (toast && Date.now() - toast.at > 5800) {
        updateState((draft) => {
          draft.awardToast = null;
        });
      }
    }, 5900);
  }, [liveApi, queueTimeout, reportActionError, soundAction, syncLiveMutation, updateState]);

  const undoAward = useCallback(() => {
    const toast = stateRef.current.awardToast;
    if (!toast) return;

    if (liveApi) {
      updateState((draft) => {
        draft.awardToast = null;
      });
      void refreshLiveBoard().catch((error) => {
        reportActionError(error);
      });
      return;
    }

    updateState((draft) => {
      const child = getChild(draft.children, toast.childId);
      if (!child) return;

      if (toast.rowId === "bonus") {
        child.bonus[toast.day] = toast.previous;
      } else {
        const row = child.chores.find((entry) => entry.id === toast.rowId);
        if (row) row.cells[toast.day] = toast.previous;
      }

      draft.awardToast = null;
    });
  }, [liveApi, refreshLiveBoard, reportActionError, updateState]);

  const runPayday = useCallback(() => {
    if (liveApi) {
      void syncLiveMutation("/api/payday/run", {}).catch((error) => {
        reportActionError(error);
      });
      soundPayout();
      return;
    }

    updateState((draft) => {
      draft.children.forEach((child) => {
        const summary = previewPayday(child, draft.interestRate);
        draft.paydaySummary[child.id] = summary;
        child.coins = summary.newBalance;
        finalizeWeekCells(child);
      });

      (Object.keys(draft.paydaySummary) as ChildId[]).forEach((childId) => {
        const summary = draft.paydaySummary[childId];
        draft.celebrationVisuals[childId] = {
          showStars: false,
          showInterest: false,
          stars: 0,
          interest: 0,
          balance: summary.carried,
        };
      });

      draft.kidsScreen = "paydayReady";
      draft.currentDay = 6;
      draft.showPaydayCTAHome = false;
      draft.celebrationPlayed = false;
      draft.view = "kids";
      draft.parentScreen = "home";
      draft.celebrationSeed = Date.now();
    });

    soundPayout();
  }, [finalizeWeekCells, liveApi, previewPayday, reportActionError, soundPayout, syncLiveMutation, updateState]);

  const setQueueTab = useCallback((tab: AppState["queueTab"]) => {
    updateState((draft) => {
      draft.queueTab = tab;
    });
  }, [updateState]);

  const setView = useCallback((view: AppState["view"]) => {
    updateState((draft) => {
      draft.view = view;
    });
  }, [updateState]);

  const fulfillRedemption = useCallback((redemptionId: string) => {
    if (liveApi) {
      void syncLiveMutation("/api/redemptions/fulfill", { redemptionId }).catch(async (error) => {
        reportActionError(error);
        try {
          await refreshLiveBoard();
        } catch {
          // Keep original error visible; board refresh is best-effort recovery.
        }
      });
      soundInterest();
      return;
    }

    updateState((draft) => {
      const entry = draft.redemptions.find((item) => item.id === redemptionId);
      if (!entry || entry.status !== "pending") return;
      entry.status = "fulfilled";
      entry.fulfilledAt = Date.now();
    });

    soundInterest();
  }, [liveApi, refreshLiveBoard, reportActionError, soundInterest, syncLiveMutation, updateState]);

  const archiveRedemption = useCallback((redemptionId: string) => {
    if (liveApi) {
      void syncLiveMutation("/api/redemptions/archive", { redemptionId }).catch(async (error) => {
        reportActionError(error);
        try {
          await refreshLiveBoard();
        } catch {
          // Keep original error visible; board refresh is best-effort recovery.
        }
      });
      soundAction();
      return;
    }

    updateState((draft) => {
      draft.redemptions = draft.redemptions.filter((item) => item.id !== redemptionId);
    });
    soundAction();
  }, [liveApi, refreshLiveBoard, reportActionError, soundAction, syncLiveMutation, updateState]);

  const toggleSounds = useCallback(() => {
    const nextSounds = !stateRef.current.settings.sounds;

    updateState((draft) => {
      draft.settings.sounds = nextSounds;
    });

    if (liveApi) {
      void syncLiveMutation("/api/settings", { sounds: nextSounds }, "PATCH").catch((error) => {
        reportActionError(error);
      });
    }

    const soundEnabled = nextSounds;
    const store = audioRef.current;

    if (!soundEnabled) {
      store.unlocked = false;
      if (store.context && store.context.state === "running") {
        void store.context.suspend();
      }
      return;
    }

    if (store.context && store.context.state === "suspended") {
      void store.context.resume();
    }
  }, [liveApi, reportActionError, syncLiveMutation, updateState]);

  const toggleAnimations = useCallback(() => {
    const nextAnimations = !stateRef.current.settings.animations;

    updateState((draft) => {
      draft.settings.animations = nextAnimations;
    });

    if (liveApi) {
      void syncLiveMutation("/api/settings", { animations: nextAnimations }, "PATCH").catch((error) => {
        reportActionError(error);
      });
    }
  }, [liveApi, reportActionError, syncLiveMutation, updateState]);

  const changeInterest = useCallback(() => {
    const nextRate = stateRef.current.interestRate === 5 ? 20 : 5;

    updateState((draft) => {
      draft.interestRate = nextRate;
    });

    if (liveApi) {
      void syncLiveMutation("/api/settings", { interestRate: nextRate }, "PATCH").catch((error) => {
        reportActionError(error);
      });
    }
  }, [liveApi, reportActionError, syncLiveMutation, updateState]);

  const replaceState = useCallback((next: AppState) => {
    setState(structuredClone(next) as AppState);
  }, []);

  const replaceRewards = useCallback((next: Reward[]) => {
    setRewards(structuredClone(next) as Reward[]);
  }, []);

  const clearApiError = useCallback(() => {
    setApiError(null);
  }, []);

  const selectedAwardRowState = useMemo(() => {
    const child = getChild(state.children, state.parentSelectedChildId);
    if (!child) return "empty" as StarCellState;

    if (state.parentSelectedChoreId === "bonus") {
      return child.bonus[state.parentSelectedDay];
    }

    const chore = child.chores.find((entry) => entry.id === state.parentSelectedChoreId);
    return chore ? chore.cells[state.parentSelectedDay] : "empty";
  }, [state.children, state.parentSelectedChildId, state.parentSelectedChoreId, state.parentSelectedDay]);

  const fallingCoins = useMemo(() => createFallingCoins(state.celebrationSeed), [state.celebrationSeed]);

  const unlockOnPointerDown = useCallback(() => {
    unlockSound();
  }, [unlockSound]);

  useEffect(() => {
    window.addEventListener("pointerdown", unlockOnPointerDown, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", unlockOnPointerDown);
    };
  }, [unlockOnPointerDown]);

  return {
    state,
    days: DAYS,
    rewards,
    apiError,
    fallingCoins,
    selectedAwardRowState,
    getStarCounts,
    formatRelativeTime,
    getReward: (rewardId: string) => getReward(rewards, rewardId),
    getChild,
    isLatestClaim,
    unlockSound,
    runCelebrationSequence,
    refreshLiveBoard,
    refreshLiveRewards,
    actions: {
      clearApiError,
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
      changeInterest,
      soundCoinTap,
      soundStoreDoorChime,
      replaceState,
      replaceRewards,
      applyLiveBoard,
    },
  };
}
