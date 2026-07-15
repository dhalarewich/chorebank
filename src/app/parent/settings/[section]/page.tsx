import { notFound } from "next/navigation";
import { renderChoreBoardPage } from "@/app/_render-chore-board-page";

interface ParentSettingsSectionPageProps {
  params: Promise<{ section: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const validSections = new Set(["children", "chores", "rewards", "household", "app"]);

export default async function ParentSettingsSectionPage({ params, searchParams }: ParentSettingsSectionPageProps) {
  const { section } = await params;
  if (!validSections.has(section)) {
    notFound();
  }

  return renderChoreBoardPage({ searchParams });
}
