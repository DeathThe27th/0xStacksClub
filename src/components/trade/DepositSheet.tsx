"use client";

import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Check, Copy, CreditCard, Diamond, QrCode, Smartphone } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useRef, useState } from "react";
import { erc20Abi, formatUnits, type Address } from "viem";
import { Sheet } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { USDT_ADDRESS } from "@/lib/constants";
import { browserPublicClient, useActiveWallet } from "@/lib/client/wallet";

type View = "menu" | "crypto" | "binance";

/** Deposit with (UI_SPEC §7, FLOWS §1). No server state; balances polled from chain every 5s. */
export function DepositSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [view, setView] = useState<View>("menu");
  useEffect(() => {
    if (!open) setView("menu");
  }, [open]);
  return (
    <Sheet open={open} onClose={onClose} title={view === "menu" ? "Deposit with" : view === "crypto" ? "Receive USDT" : "Withdraw from Binance"}>
      {view === "menu" ? (
        <div className="space-y-3">
          <Option title="Crypto" subtitle="Receive USDT on BNB Chain" icon={<QrCode size={26} />} onClick={() => setView("crypto")} />
          <Option title="Binance" subtitle="Withdraw from your Binance account" icon={<Diamond size={24} className="fill-warn text-warn" />} onClick={() => setView("binance")} />
          <Option title="Apple Pay" subtitle="Pay with Apple Pay" icon={<Smartphone size={24} />} soon />
          <Option title="Debit card" subtitle="Deposit cash with a debit card" icon={<CreditCard size={24} />} soon />
        </div>
      ) : (
        <AddressView binance={view === "binance"} onBack={() => setView("menu")} />
      )}
    </Sheet>
  );
}

function Option({ title, subtitle, icon, onClick, soon }: { title: string; subtitle: string; icon: React.ReactNode; onClick?: () => void; soon?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={soon}
      className="press flex h-[72px] w-full items-center gap-3 rounded-card bg-surface-2 px-4 text-left disabled:cursor-not-allowed disabled:active:scale-100"
    >
      <div className={cn("min-w-0 flex-1", soon && "opacity-50")}>
        <p className="flex items-center gap-2 text-[17px] font-semibold">
          {title}
          {soon && <span className="rounded-badge bg-border px-1.5 py-0.5 text-[11px] font-semibold text-text-muted">Soon</span>}
        </p>
        <p className="truncate text-secondary text-text-muted">{subtitle}</p>
      </div>
      <span className={cn("text-text", soon && "opacity-50")}>{icon}</span>
    </button>
  );
}

function AddressView({ binance, onBack }: { binance: boolean; onBack: () => void }) {
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

  if (!address) return null;
  const copy = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
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
      <div className="mt-3 flex gap-3 rounded-card border border-warn/30 bg-warn/10 p-3">
        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warn" />
        <p className="text-secondary text-text">
          Only send USDT on BNB Smart Chain (BEP-20). You also need a little BNB for network fees, about 0.002 BNB.
        </p>
      </div>
      {binance && (
        <ol className="mt-4 space-y-3 text-secondary text-text">
          {[
            "In the Binance app, open Assets and tap Withdraw.",
            "Choose USDT, paste the address above, and pick BNB Smart Chain (BEP20) as the network.",
            "Enter the amount and confirm. Arrival usually takes under a minute.",
            "Repeat for a small amount of BNB (same address, same network) to cover fees.",
          ].map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-surface-2 text-[12px] font-semibold">{i + 1}</span>
              <span className="pt-0.5">{s}</span>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-4 text-center text-[13px] text-text-muted">Watching for incoming USDT and BNB…</p>
    </div>
  );
}
