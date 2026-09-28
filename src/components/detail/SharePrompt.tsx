"use client";

import { PartyPopper } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { APP_NAME } from "@/lib/constants";

/** After launch: "Share AI Kings on X" with a prefilled post (FLOWS §8). */
export function SharePrompt({ name, ticker }: { name: string; ticker: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("created") === "1") {
      setOpen(true);
      url.searchParams.delete("created");
      window.history.replaceState(null, "", url.toString());
    }
  }, []);
  const link = typeof window !== "undefined" ? (window.location.href.split("?")[0] ?? "") : "";
  const text = `I just launched $${ticker} (${name}) on ${APP_NAME}, a basket of tokenized stocks on BNB Chain.`;
  return (
    <Sheet open={open} onClose={() => setOpen(false)}>
      <div className="flex flex-col items-center pb-2 text-center">
        <PartyPopper size={56} className="text-warn" strokeWidth={1.5} />
        <p className="mt-4 text-[22px] font-bold">${ticker} is live</p>
        <p className="mt-1 max-w-[30ch] text-secondary text-text-muted">Your recipe is onchain and can&apos;t change. You earn 25% of the buy fee each time someone buys it.</p>
        <a
          className="mt-6 w-full"
          href={`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(link)}`}
          target="_blank"
          rel="noreferrer"
        >
          <Button className="w-full">Share {name} on X</Button>
        </a>
        <Button variant="ghost" className="mt-1 w-full" onClick={() => setOpen(false)}>
          Not now
        </Button>
      </div>
    </Sheet>
  );
}
