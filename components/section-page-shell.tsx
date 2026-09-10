"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import Link from "next/link";
import {
  Activity,
  BookOpen,
  ChevronDown,
  Github,
  Home,
  LayoutDashboard,
  Menu,
  PanelLeftClose,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { Logo } from "./logo";
import { cn } from "@/lib/utils";

type Section = "history" | "evaluations" | "settings";

export function SectionPageShell({
  active,
  eyebrow,
  title,
  children,
}: {
  active: Section;
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="appShell">
      <aside className={cn("appSidebar", sidebarOpen && "sidebarOpen")}>
        <div className="sidebarBrand">
          <Logo href="/dashboard" />
          <button
            className="iconButton mobileOnly"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close navigation"
          >
            <PanelLeftClose size={18} />
          </button>
        </div>
        <nav className="sidebarNav" aria-label="Workspace">
          <Link className="sidebarLink" href="/dashboard">
            <LayoutDashboard size={17} />
            Workspace
          </Link>
          <Link
            className={cn("sidebarLink", active === "history" && "active")}
            href="/history"
          >
            <Activity size={17} />
            Run history
            <span className="navCount">Local</span>
          </Link>
          <Link
            className={cn("sidebarLink", active === "evaluations" && "active")}
            href="/evaluations"
          >
            <BookOpen size={17} />
            Evaluations
          </Link>
          <Link
            className={cn("sidebarLink", active === "settings" && "active")}
            href="/settings"
          >
            <Settings size={17} />
            Settings
          </Link>
        </nav>
        <div className="sidebarSection">
          <span>RECENT REPOSITORIES</span>
          <Link className="sidebarRepoLink" href="/dashboard">
            <span className="repoAvatar">A</span>
            <div>
              <strong>payments-api</strong>
              <small>acme</small>
            </div>
          </Link>
          <Link className="sidebarRepoLink" href="/dashboard">
            <span className="repoAvatar violet">N</span>
            <div>
              <strong>next-dashboard</strong>
              <small>northstar</small>
            </div>
          </Link>
        </div>
        <div className="sidebarBottom">
          <div className="safetyCard">
            <ShieldCheck size={17} />
            <div>
              <strong>Write guard active</strong>
              <span>Approval required</span>
            </div>
          </div>
          <div className="userCard">
            <span>SB</span>
            <div>
              <strong>Sagar Bagwe</strong>
              <small>Personal workspace</small>
            </div>
            <ChevronDown size={15} />
          </div>
        </div>
      </aside>

      {sidebarOpen && (
        <button
          className="sidebarScrim"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close navigation"
        />
      )}

      <div className="appMain">
        <header className="appTopbar">
          <div className="topbarTitle">
            <button
              className="iconButton mobileOnly"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation"
            >
              <Menu size={19} />
            </button>
            <div>
              <span>{eyebrow}</span>
              <strong>{title}</strong>
            </div>
          </div>
          <div className="topbarActions">
            <div className="runtimeStatus">
              <i />
              Runtime healthy
            </div>
            <a
              className="iconButton"
              href="https://github.com"
              target="_blank"
              rel="noreferrer"
              aria-label="Open GitHub"
            >
              <Github size={18} />
            </a>
            <Link className="iconButton" href="/" aria-label="Home">
              <Home size={18} />
            </Link>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
