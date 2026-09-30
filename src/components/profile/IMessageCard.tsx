"use client";

import { MessageCircle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { cn } from "@/lib/cn";
import { APP_NAME } from "@/lib/constants";
import { IMessageConnect, useIMessage } from "./IMessageConnect";

/**
 * The texting assistant, up front: on Home and beside the trade panel. Connects a phone in a sheet;
 * once connected it opens Messages on the assistant's number.
 */
export function IMessageCard({ className }: { className?: string }) {
  const q = useIMessage();
  const [open, setOpen] = useState(false);
  const data = q.data;
  // Nothing to offer until the server says texting is set up (or a phone is already linked).
  if (!data || (!data.available && !data.linked)) return null;
  const linked = data.linked;
  return (
    <>
      <section className={cn("rounded-card border border-border bg-surface p-4", className)}>
        <div className="flex items-start gap-3">
          <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-full", linked ? "bg-up/15 text-up" : "bg-primary/15 text-link")}>
            <MessageCircle size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[16px] font-semibold">{linked ? `Text ${APP_NAME}` : "Trade by text"}</p>
            <p className="mt-0.5 text-secondary text-text-muted">
              {linked
                ? "Ask for a price, check your portfolio or buy a stock, right from iMessage."
                : `Connect iMessage and ${APP_NAME} becomes a contact: ask for prices, check your portfolio and buy stocks by text.`}
            </p>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          {linked ? (
            <>
              <a href={`sms:${linked.number}`} className="flex-1">
                <Button size="md" className="w-full">
                  Open Messages
                </Button>
              </a>
              <Button size="md" variant="secondary" onClick={() => setOpen(true)}>
                Manage
              </Button>
            </>
          ) : (
            <Button size="md" className="w-full" onClick={() => setOpen(true)}>
              {data.pending ? "Finish connecting" : "Connect iMessage"}
            </Button>
          )}
        </div>
      </section>
      <Sheet open={open} onClose={() => setOpen(false)} title="iMessage">
        <IMessageConnect />
      </Sheet>
    </>
  );
}
