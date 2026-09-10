import type { Metadata } from "next";
import { HistoryPage } from "@/components/history-page";

export const metadata: Metadata = {
  title: "Run history",
};

export default function RunHistoryPage() {
  return <HistoryPage />;
}
