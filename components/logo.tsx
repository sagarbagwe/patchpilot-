import Link from "next/link";
import { GitPullRequestArrow } from "lucide-react";

export function Logo({
  compact = false,
  href = "/",
}: {
  compact?: boolean;
  href?: string;
}) {
  return (
    <Link className="brand" href={href} aria-label="PatchPilot home">
      <span className="brandMark" aria-hidden="true">
        <GitPullRequestArrow size={18} strokeWidth={2.4} />
      </span>
      {!compact && <span className="brandName">PatchPilot</span>}
    </Link>
  );
}
