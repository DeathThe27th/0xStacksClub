"use client";

import { BadgeCheck, Check, Copy, History, Share, Star } from "lucide-react";
import { useState } from "react";
import { TokenLogo } from "@/components/ui/TokenLogo";
import { cn } from "@/lib/cn";

export function DetailTopBar({
  logo,
  basket,
  title,
  verified,
  subtitle,
  copyValue,
  subtitleNode,
  watched,
  onWatch,
  onHistory,
}: {
  logo: string | null;
  /** Basket ticker, so curated baskets show their badge. */
  basket?: string | null;
  title: string;
  /** Show the verified badge: an allowlisted stock, or a basket made by the 3AM team. */
  verified?: string | null;
  subtitle: string;
  copyValue?: string;
  subtitleNode?: React.ReactNode;
  watched?: boolean;
  onWatch?: () => void;
  onHistory?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = window.location.href;
    if (navigator.share) await navigator.share({ url, title }).catch(() => undefined);
    else await navigator.clipboard.writeText(url);
  };
  return (
    <header className="flex items-center gap-3 pl-gutter pr-1 pt-3 lg:px-0 lg:pt-0">
      <TokenLogo src={logo} label={title} basket={basket} size={40} />
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-center gap-1 text-[18px] font-bold leading-tight">
          <span className="truncate">{title}</span>
          {verified && <VerifiedBadge label={verified} />}
        </p>
        {subtitleNode ?? (
          <button
            onClick={async () => {
              if (!copyValue) return;
              await navigator.clipboard.writeText(copyValue);
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            }}
            className="flex max-w-full items-center gap-1 text-secondary text-text-muted hover:text-text"
            aria-label={copyValue ? "Copy contract address" : undefined}
          >
            <span className="truncate">{subtitle}</span>
            {copyValue && (copied ? <Check size={14} className="shrink-0 text-up" /> : <Copy size={14} className="shrink-0" />)}
          </button>
        )}
      </div>
      <div className="flex items-center">
        {onHistory && (
          <IconButton label="Your trades" onClick={onHistory}>
            <History size={22} />
          </IconButton>
        )}
        {onWatch && (
          <IconButton label={watched ? "Remove from watchlist" : "Add to watchlist"} onClick={onWatch}>
            <Star size={22} className={cn(watched && "fill-warn text-warn")} />
          </IconButton>
        )}
        <IconButton label="Share" onClick={share}>
          <Share size={22} />
        </IconButton>
      </div>
    </header>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} className="press grid h-11 w-11 place-items-center text-text-muted hover:text-text">
      {children}
    </button>
  );
}

/** Filled check badge; its outline takes the page background so it reads as a solid seal. */
export function VerifiedBadge({ label, size = 18 }: { label: string; size?: number }) {
  return (
    <span title={label} aria-label={label} role="img" className="inline-flex shrink-0">
      <BadgeCheck size={size} strokeWidth={2.25} className="fill-primary text-bg" aria-hidden />
    </span>
  );
}
