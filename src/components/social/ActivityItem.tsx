import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { TokenLogo } from "@/components/ui/TokenLogo";
import { timeAgo, usd } from "@/lib/format";
import type { Activity } from "@/lib/client/types";

const verb: Record<Activity["type"], string> = { buy: "bought", sell: "sold", redeem: "redeemed", create_stack: "created", claim: "claimed" };

/** "@ada bought $120 of AI Kings" with the asset row inline (UI_SPEC §8.3). */
export function ActivityItem({ a, showActor = true }: { a: Activity; showActor?: boolean }) {
  const name = a.target?.kind === "stack" ? a.target.stack.name : a.target?.kind === "asset" ? a.target.asset.ticker : null;
  const href = a.target?.kind === "stack" ? `/app/basket/${a.target.stack.id}` : a.target?.kind === "asset" ? `/app/stock/${a.target.asset.provider}/${a.target.asset.address}` : null;
  const amount = a.usd_amount != null ? usd(Number(a.usd_amount)) : null;
  const text =
    a.type === "claim"
      ? `claimed ${amount ?? ""} in creator fees`
      : a.type === "create_stack"
        ? `created ${name ?? "a basket"}`
        : `${verb[a.type]}${amount ? ` ${amount} of` : ""} ${name ?? ""}`;
  return (
    <div className="flex gap-3 py-3">
      {showActor && (
        <Link href={a.actor ? `/app/u/${a.actor.username}` : "#"}>
          <Avatar src={a.actor?.avatar_url} name={a.actor?.username} size={40} />
        </Link>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[15px]">
          {showActor && <span className="font-semibold">@{a.actor?.username} </span>}
          <span className="text-text">{text}</span>
          <span className="ml-2 text-[13px] text-text-dim">{timeAgo(a.created_at)}</span>
        </p>
        {href && a.target && (
          <Link href={href} className="press mt-2 flex items-center gap-3 rounded-chip bg-surface p-2.5">
            <TokenLogo src={a.target.kind === "stack" ? a.target.stack.image_url : a.target.asset.logo_url} label={a.target.kind === "stack" ? a.target.stack.ticker : a.target.asset.ticker} size={32} />
            <span className="text-[15px] font-semibold uppercase">{a.target.kind === "stack" ? `$${a.target.stack.ticker}` : a.target.asset.ticker}</span>
            {a.target.kind === "stack" && <span className="truncate text-secondary text-text-muted">{a.target.stack.name}</span>}
          </Link>
        )}
      </div>
    </div>
  );
}
