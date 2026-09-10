import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "PatchPilot — Agentic issue-to-PR workspace",
    template: "%s · PatchPilot",
  },
  description:
    "Turn a GitHub issue into a reviewed, test-ready patch with an observable agent workflow and human approval.",
  metadataBase: new URL("https://patchpilot.vercel.app"),
  openGraph: {
    title: "PatchPilot",
    description: "From issue to reviewed patch, with every agent step visible.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
