import { renderChoreBoardPage } from "@/app/_render-chore-board-page";

interface KidsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function KidsPage({ searchParams }: KidsPageProps) {
  return renderChoreBoardPage({ searchParams });
}
