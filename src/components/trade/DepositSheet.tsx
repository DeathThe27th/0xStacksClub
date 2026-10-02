"use client";

import { useAddFunds } from "@privy-io/react-auth";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, ChevronLeft, Copy, CreditCard, Fuel, QrCode } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useRef, useState } from "react";
import { erc20Abi, formatUnits, zeroAddress, type Address } from "viem";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { CHAIN_ID, USDT_ADDRESS } from "@/lib/constants";
import { gasNeededWei } from "@/lib/client/runner";
import { browserPublicClient, useActiveWallet } from "@/lib/client/wallet";
import { TradeSteps, type StepStatus } from "./TradeSteps";

type View = "menu" | "crypto" | "card-usdt" | "card-bnb";

/**
 * Deposit (UI_SPEC §7, FLOWS §1): crypto or card. Card goes through Privy's funding flow, where a
 * licensed provider sells USDT (to trade) or BNB (for network fees) on BNB Chain straight to the
 * user's own wallet; the app never holds it. Balances are polled from chain every 5s.
 */
export function DepositSheet({ open, onClose, anchor }: { open: boolean; onClose: () => void; anchor?: "left" | "right" }) {
  const [view, setView] = useState<View>("menu");
  useEffect(() => {
    if (!open) setView("menu");
  }, [open]);
  return (
    <Sheet open={open} onClose={onClose} title={
        view === "menu" ? (
          "Deposit"
        ) : view === "card-usdt" ? (
          "Deposit with card"
        ) : view === "card-bnb" ? (
          "Buy BNB for fees"
        ) : (
          <span className="relative flex items-center justify-center">
            <button onClick={() => setView("menu")} aria-label="Back" className="press absolute -left-2 grid h-10 w-10 place-items-center rounded-full text-text-muted hover:bg-surface-2 hover:text-text">
              <ChevronLeft size={22} />
            </button>
            Deposit crypto
          </span>
        )
      } anchor={anchor}>
      {view === "menu" ? (
        <div className="space-y-3">
          <Option title="Deposit with card" subtitle="Debit card or Apple Pay, arrives as USDT" icon={<CreditCard size={24} />} onClick={() => setView("card-usdt")} />
          <Option title="Buy BNB for fees" subtitle="Card or Apple Pay. A few dollars covers many trades" icon={<Fuel size={24} />} onClick={() => setView("card-bnb")} />
          <Option title="Deposit crypto" subtitle="Send USDT or BNB on BNB Chain" icon={<QrCode size={24} />} onClick={() => setView("crypto")} />
        </div>
      ) : view === "card-usdt" || view === "card-bnb" ? (
        <CardView key={view} asset={view === "card-usdt" ? "usdt" : "bnb"} onExit={() => setView("menu")} onDone={onClose} onBuyBnb={() => setView("card-bnb")} />
      ) : (
        <AddressView />
      )}
    </Sheet>
  );
}

function Option({ title, subtitle, icon, onClick, soon }: { title: string; subtitle?: string; icon: React.ReactNode; onClick?: () => void; soon?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={soon}
      className="press flex min-h-[72px] w-full items-center gap-3 rounded-card bg-surface-2 px-4 py-3 text-left disabled:cursor-not-allowed disabled:active:scale-100"
    >
      <span className={cn("text-text", soon && "opacity-50")}>{icon}</span>
      <span className={cn("min-w-0 flex-1", soon && "opacity-50")}>
        <span className="block text-[17px] font-semibold leading-tight">{title}</span>
        {subtitle && <span className="mt-0.5 block truncate text-secondary text-text-muted">{subtitle}</span>}
      </span>
      {soon && <span className="rounded-badge bg-border px-1.5 py-0.5 text-[11px] font-semibold text-text-muted">Soon</span>}
    </button>
  );
}

type CardPhase = "opening" | "paying" | "arriving" | "arrived" | "failed";
type CardAsset = "usdt" | "bnb";

const CARD: Record<CardAsset, { symbol: string; asset: Address; amount: string; decimals: number }> = {
  usdt: { symbol: "USDT", asset: USDT_ADDRESS, amount: "50", decimals: 18 },
  // BNB is the chain's own coin, not a token: Privy's funding code names a native coin with the
  // zero address (its bridging default). Confirm on the first live purchase.
  bnb: { symbol: "BNB", asset: zeroAddress, amount: "20", decimals: 18 },
};

/**
 * Card purchase of USDT (to trade) or BNB (for network fees): opens Privy's funding flow to the
 * user's own wallet on BNB Chain, then watches the chain until it lands. After USDT lands in a
 * wallet without enough BNB for a buy, it offers to buy BNB the same way.
 */
function CardView({ asset, onExit, onDone, onBuyBnb }: { asset: CardAsset; onExit: () => void; onDone: () => void; onBuyBnb: () => void }) {
  const wallet = useActiveWallet();
  const address = wallet?.address as Address | undefined;
  const { addFunds } = useAddFunds();
  const toast = useToast();
  const qc = useQueryClient();
  const c = CARD[asset];
  const [phase, setPhase] = useState<CardPhase>("opening");
  const [error, setError] = useState<string | null>(null);
  const [lowGas, setLowGas] = useState(false);
  const baseline = useRef<bigint | null>(null);
  const opened = useRef(false);

  const readBalance = useCallback(async () => {
    if (!address) return 0n;
    const pc = browserPublicClient();
    return asset === "bnb" ? pc.getBalance({ address }) : pc.readContract({ address: USDT_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [address] });
  }, [address, asset]);

  // Open the provider's checkout once, after noting the balance it should raise.
  useEffect(() => {
    if (!address || opened.current) return;
    opened.current = true;
    void (async () => {
      baseline.current = await readBalance().catch(() => 0n);
      try {
        setPhase("paying");
        await addFunds({
          destination: { address, chain: `eip155:${CHAIN_ID}`, asset: c.asset },
          fiat: { source: { defaultAsset: "usd" }, defaultAmount: c.amount },
        });
        setPhase("arriving");
      } catch (e) {
        const msg = (e as Error)?.message ?? "";
        // Closing the checkout isn't an error: back to the options.
        if (/exit|closed|cancel/i.test(msg)) return onExit();
        setError(msg || "The card checkout didn't open");
        setPhase("failed");
      }
    })();
  }, [address, addFunds, readBalance, onExit, c]);

  // Watch for it to land.
  useEffect(() => {
    if (phase !== "arriving") return;
    let stop = false;
    const tick = async () => {
      const now = await readBalance().catch(() => null);
      if (stop || now === null || baseline.current === null || now <= baseline.current) return;
      const got = Number(formatUnits(now - baseline.current, c.decimals));
      toast({ title: `+${asset === "bnb" ? got.toFixed(4) : got.toFixed(2)} ${c.symbol} received`, tone: "up" });
      qc.invalidateQueries({ queryKey: ["portfolio"] });
      setPhase("arrived");
    };
    void tick();
    const id = setInterval(() => void tick(), 5000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [phase, readBalance, toast, qc, asset, c]);

  // USDT in, but no BNB to pay the first trade's network fee: say so and offer to buy it.
  useEffect(() => {
    if (phase !== "arrived" || asset !== "usdt" || !address) return;
    void Promise.all([browserPublicClient().getBalance({ address }), gasNeededWei("buy_stock", 1)])
      .then(([bnb, need]) => setLowGas(bnb < need))
      .catch(() => undefined);
  }, [phase, asset, address]);

  if (!address) return <p className="py-10 text-center text-secondary text-text-muted">Connecting your wallet…</p>;
  if (phase === "failed")
    return (
      <div className="space-y-3 py-2">
        <p className="text-center text-secondary text-down" role="alert">
          {error}
        </p>
        <Button variant="secondary" className="w-full" onClick={onExit}>
          Back
        </Button>
      </div>
    );

  const steps = [
    { key: "card", label: "Pay by card" },
    { key: "arrive", label: `${c.symbol} arrives in your wallet` },
  ];
  const states: Record<string, StepStatus> = {
    card: phase === "opening" || phase === "paying" ? { state: "active", note: "Finish checkout in the window" } : { state: "done", note: "Paid" },
    arrive:
      phase === "arriving"
        ? { state: "active", note: "Usually a few minutes. You can close this; it lands either way" }
        : phase === "arrived"
          ? { state: "done", note: asset === "bnb" ? "Ready for network fees" : "In your wallet" }
          : { state: "idle" },
  };

  return (
    <div>
      <div className="rounded-card bg-surface-2 px-4 pb-3 pt-4">
        <TradeSteps steps={steps} states={states} />
      </div>
      {lowGas && (
        <div className="mt-4 rounded-card border border-border p-4">
          <p className="text-[15px] font-semibold">One more thing: network fees</p>
          <p className="mt-1 text-secondary text-text-muted">Each trade costs a tiny fee paid in BNB, and this wallet has none yet. A few dollars of BNB covers many trades.</p>
          <Button className="mt-3 w-full" size="md" onClick={onBuyBnb}>
            Buy BNB for fees
          </Button>
        </div>
      )}
      <Button variant={phase === "arrived" && !lowGas ? undefined : "secondary"} className="mt-5 w-full" onClick={onDone}>
        {phase === "arrived" ? "Start trading" : "Close"}
      </Button>
    </div>
  );
}

function AddressView() {
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
      <div className="mx-auto w-fit rounded-card bg-white p-4">
        <QRCodeSVG value={address} size={188} bgColor="#FFFFFF" fgColor="#0A0A12" level="M" />
      </div>
      <button onClick={copy} className="press mt-4 flex w-full items-center gap-3 rounded-card bg-surface-2 px-4 py-3 text-left">
        <span className="min-w-0 flex-1 break-all font-mono text-[14px] leading-5">{address}</span>
        {copied ? <Check size={18} className="shrink-0 text-up" /> : <Copy size={18} className="shrink-0 text-text-muted" />}
      </button>
      <p className="mt-3 flex items-start gap-2 text-secondary text-text-muted">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warn" />
        USDT or BNB on BNB Chain (BEP-20) only. Keep a little BNB for network fees.
      </p>
    </div>
  );
}
