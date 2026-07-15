import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ChoreBoardApp } from "@/components/chore-board/ChoreBoardApp";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { getBoardState, getRewards } from "@/lib/server/domain/board-service";
import { isDemoModeAllowed } from "@/lib/server/runtime-mode";

type SearchParams = Record<string, string | string[] | undefined>;

interface ChoreBoardPageProps {
  searchParams?: Promise<SearchParams>;
}

function readParam(value: string | string[] | undefined): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? "";
  return "";
}

export async function renderChoreBoardPage({ searchParams }: ChoreBoardPageProps = {}) {
  const params = searchParams ? await searchParams : {};
  const mode = readParam(params.mode);

  if (mode === "demo" && isDemoModeAllowed()) {
    return <ChoreBoardApp initialActor="parent" initialMode="demo" />;
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const payload = token ? verifySessionToken(token) : null;

  if (!payload) {
    redirect("/auth");
  }

  const [initialBoard, initialRewards] = await Promise.all([getBoardState(payload.householdId), getRewards(payload.householdId)]);

  return (
    <ChoreBoardApp
      initialActor={payload.actor}
      initialMode="live"
      initialChildId={payload.childId}
      initialBoard={initialBoard}
      initialRewards={initialRewards}
    />
  );
}
