"use client";

import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Check, Copy, CreditCard, QrCode } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useRef, useState } from "react";
import { erc20Abi, formatUnits, type Address } from "viem";
import { Sheet } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { USDT_ADDRESS } from "@/lib/constants";
import { browserPublicClient, useActiveWallet } from "@/lib/client/wallet";

type View = "menu" | "crypto";

/** Deposit (UI_SPEC §7, FLOWS §1): crypto or card. No server state; balances polled from chain every 5s. */
export function DepositSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [view, setView] = useState<View>("menu");
  useEffect(() => {
    if (!open) setView("menu");
  }, [open]);
  return (
    <Sheet open={open} onClose={onClose} title={view === "menu" ? "Deposit" : "Deposit crypto"}>
      {view === "menu" ? (
        <div className="space-y-3">
          <Option title="Deposit crypto" icon={<QrCode size={24} />} onClick={() => setView("crypto")} />
          {/* Card deposits land with the Transak integration. */}
          <Option title="Deposit with card" icon={<CreditCard size={24} />} soon />
        </div>
      ) : (
        <AddressView onBack={() => setView("menu")} />
      )}
    </Sheet>
  );
}

function Option({ title, icon, onClick, soon }: { title: string; icon: React.ReactNode; onClick?: () => void; soon?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={soon}
      className="press flex h-16 w-full items-center gap-3 rounded-card bg-surface-2 px-4 text-left disabled:cursor-not-allowed disabled:active:scale-100"
    >
      <span className={cn("text-text", soon && "opacity-50")}>{icon}</span>
      <span className={cn("flex-1 text-[17px] font-semibold", soon && "opacity-50")}>{title}</span>
      {soon && <span className="rounded-badge bg-border px-1.5 py-0.5 text-[11px] font-semibold text-text-muted">Soon</span>}
    </button>
  );
}

function AddressView({ onBack }: { onBack: () => void }) {
  const wallet = useActiveWallet();
  const address = wallet?.address as Address | undefined;
  const toast = useToast();
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);
  const last = useRef<{ usdt: bigint; bnb: bigint } | null>(null);
  const [decimals, setDecimals] = useState<number | null>(null);

  useEffect(() => {
    if (!address) return;
    let stop = false;
    const pc = browserPublicClient();
    const tick = async () => {
      try {
        const [usdt, bnb, dec] = await Promise.all([
          pc.readContract({ address: USDT_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [address] }),
          pc.getBalance({ address }),
          decimals === null ? pc.readContract({ address: USDT_ADDRESS, abi: erc20Abi, functionName: "decimals" }) : Promise.resolve(decimals),
        ]);
        if (decimals === null) setDecimals(dec);
        if (last.current) {
          if (usdt > last.current.usdt) {
            toast({ title: `+${Number(formatUnits(usdt - last.current.usdt, dec)).toFixed(2)} USDT received`, tone: "up" });
            qc.invalidateQueries({ queryKey: ["portfolio"] });
          }
          if (bnb > last.current.bnb) {
            toast({ title: `+${Number(formatUnits(bnb - last.current.bnb, 18)).toFixed(4)} BNB received`, tone: "up" });
            qc.invalidateQueries({ queryKey: ["portfolio"] });
          }
        }
        last.current = { usdt, bnb };
      } catch {
        /* transient RPC error; next tick retries */
      }
    };
    void tick();
    const id = setInterval(() => !stop && void tick(), 5000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [address, toast, qc, decimals]);

  if (!address) return <p className="py-10 text-center text-secondary text-text-muted">Connecting your wallet…</p>;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({ title: "Couldn't copy, select the address instead", tone: "down" });
    }
  };

  return (
    <div>
      <button onClick={onBack} className="press -mt-2 mb-3 flex items-center gap-1 text-secondary text-text-muted hover:text-text">
        <ArrowLeft size={16} /> Back
      </button>
      <div className="mx-auto w-fit rounded-card bg-white p-4">
        <QRCodeSVG value={address} size={188} bgColor="#FFFFFF" fgColor="#0A0A12" level="M" />
      </div>
      <button onClick={copy} className="press mt-4 flex w-full items-center gap-3 rounded-card bg-surface-2 px-4 py-3 text-left">
        <span className="min-w-0 flex-1 break-all font-mono text-[14px] leading-5">{address}</span>
        {copied ? <Check size={18} className="shrink-0 text-up" /> : <Copy size={18} className="shrink-0 text-text-muted" />}
      </button>
      <p className="mt-3 flex items-start gap-2 text-secondary text-text-muted">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warn" />
        USDT on BNB Chain (BEP-20) only. Keep a little BNB for gas.
      </p>
    </div>
  );
}
