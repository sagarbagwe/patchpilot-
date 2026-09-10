import type { Metadata } from "next";
import { WorkflowStudio } from "@/components/workflow-studio";

export const metadata: Metadata = {
  title: "Workspace",
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ autorun?: string }>;
}) {
  const params = await searchParams;
  return <WorkflowStudio autoRun={params.autorun === "1"} />;
}
