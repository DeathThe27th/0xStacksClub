"use client";

import { useQuery } from "@tanstack/react-query";
import { Receipt } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { RowSkeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/States";
import { cn } from "@/lib/cn";
import { price, timeAgo, usd } from "@/lib/format";
import { useApi } from "@/lib/client/api";

type Trade = { id: number; side: "buy" | "sell"; usd_amount: string; price_usd: string | null; tx_hash: string | null; created_at: string };

export function TradesSheet({ open, onClose, targetType, targetId }: { open: boolean; onClose: () => void; targetType: "asset" | "stack"; targetId: string }) {
  const api = useApi();
  const q = useQuery({
    queryKey: ["trades", targetType, targetId],
    queryFn: () => api<{ items: Trade[] }>(`/api/trades?targetType=${targetType}&targetId=${targetId}`),
    enabled: open,
  });
  return (
    <Sheet open={open} onClose={onClose} title="Your trades">
      {q.isLoading ? (
        <RowSkeleton count={3} />
      ) : !q.data?.items.length ? (
        <EmptyState icon={<Receipt size={24} />} title="No trades yet" />
      ) : (
        <ul className="divide-y divide-border">
          {q.data.items.map((t) => (
            <li key={t.id} className="flex items-center justify-between py-3">
              <div>
                <p className={cn("text-[15px] font-semibold capitalize", t.side === "buy" ? "text-up" : "text-down")}>{t.side}</p>
                <p className="text-[13px] text-text-muted">
                  {timeAgo(t.created_at)} ago{t.price_usd ? ` · at ${price(Number(t.price_usd))}` : ""}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[15px] tnum">{usd(Number(t.usd_amount))}</p>
                {t.tx_hash && (
                  <a href={`https://bscscan.com/tx/${t.tx_hash}`} target="_blank" rel="noreferrer" className="text-[13px] text-primary">
                    BscScan
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
