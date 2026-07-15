import { renderChoreBoardPage } from "@/app/_render-chore-board-page";

interface StorePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function StorePage({ searchParams }: StorePageProps) {
  return renderChoreBoardPage({ searchParams });
}
