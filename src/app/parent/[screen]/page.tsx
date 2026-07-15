import { notFound } from "next/navigation";
import { renderChoreBoardPage } from "@/app/_render-chore-board-page";

interface ParentScreenPageProps {
  params: Promise<{ screen: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const validScreens = new Set(["award", "payday", "redemptions", "settings"]);

export default async function ParentScreenPage({ params, searchParams }: ParentScreenPageProps) {
  const { screen } = await params;
  if (!validScreens.has(screen)) {
    notFound();
  }

  return renderChoreBoardPage({ searchParams });
}
