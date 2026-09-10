import type { Metadata } from "next";
import { SettingsPage } from "@/components/settings-page";

export const metadata: Metadata = {
  title: "Settings",
};

export default function WorkspaceSettingsPage() {
  return <SettingsPage />;
}
