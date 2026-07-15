import { renderChoreBoardPage } from "@/app/_render-chore-board-page";

interface HomePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  return renderChoreBoardPage({ searchParams });
}
