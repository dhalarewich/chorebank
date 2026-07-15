import { renderChoreBoardPage } from "@/app/_render-chore-board-page";

interface ParentPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ParentPage({ searchParams }: ParentPageProps) {
  return renderChoreBoardPage({ searchParams });
}
