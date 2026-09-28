import { ChevronRight, Megaphone } from "lucide-react";
import Link from "next/link";
import { TokenLogo } from "@/components/ui/TokenLogo";
import { timeAgo } from "@/lib/format";
import type { StackSummary } from "@/lib/client/types";

export type ClubItem = {
  stack: StackSummary;
  members: number;
  posts24h: number;
  lastActivityAt: string;
  latestAnnouncement: { body: string; created_at: string } | null;
};

/** Clubs tab row: the Stack's Club, members, latest announcement, activity. */
export function ClubRow({ c }: { c: ClubItem }) {
  return (
    <Link href={`/app/club/${c.stack.id}`} className="press -mx-2 flex items-center gap-3 rounded-card px-2 py-3 hover:bg-surface/60">
      <TokenLogo src={c.stack.image_url} label={c.stack.ticker} size={48} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-row font-semibold">
          <span className="truncate">${c.stack.ticker} Club</span>
          {c.posts24h > 0 && <span className="rounded-badge bg-primary px-1.5 py-0.5 text-[11px] font-semibold text-on-primary">{c.posts24h} today</span>}
        </p>
        <p className="truncate text-secondary text-text-muted">
          {c.latestAnnouncement ? (
            <span className="inline-flex items-center gap-1">
              <Megaphone size={13} className="shrink-0" /> {c.latestAnnouncement.body}
            </span>
          ) : (
            <>
              by @{c.stack.creator?.username ?? "creator"} · {c.members} member{c.members === 1 ? "" : "s"}
            </>
          )}
        </p>
      </div>
      <div className="flex items-center gap-1 text-[13px] text-text-muted">
        {timeAgo(c.lastActivityAt)}
        <ChevronRight size={16} />
      </div>
    </Link>
  );
}
