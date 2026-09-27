"use client";

import { ChevronRight, RotateCcw } from "lucide-react";
import { useState } from "react";
import { IntentSheet } from "@/components/trade/IntentSheet";
import { useActiveIntents } from "@/lib/client/queries";

const label: Record<string, string> = {
  buy_stock: "buy",
  buy_stack: "Stack buy",
  sell_stock: "sell",
  sell_stack: "Stack sell",
  redeem: "redemption",
};

/** "You have an unfinished buy" — resumes from the saved state (FLOWS intro). */
export function UnfinishedBanner() {
  const q = useActiveIntents();
  const [open, setOpen] = useState<string | null>(null);
  const first = q.data?.items[0];
  if (!first) return null;
  return (
    <>
      <button
        onClick={() => setOpen(first.id)}
        className="press mx-gutter mt-3 flex w-[calc(100%-32px)] items-center gap-3 rounded-card border border-warn/30 bg-warn/10 px-4 py-3 text-left"
      >
        <RotateCcw size={18} className="shrink-0 text-warn" />
        <span className="flex-1 text-[15px] font-medium">You have an unfinished {label[first.kind]}</span>
        <span className="flex items-center text-secondary text-warn">
          Resume <ChevronRight size={16} />
        </span>
      </button>
      {open && <IntentSheet intentId={open} open onClose={() => setOpen(null)} />}
    </>
  );
}
