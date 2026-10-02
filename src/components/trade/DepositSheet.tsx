"use client";

import { useAddFunds } from "@privy-io/react-auth";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, ChevronLeft, Copy, CreditCard, QrCode } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useRef, useState } from "react";
import { erc20Abi, formatUnits, type Address } from "viem";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { CHAIN_ID, USDT_ADDRESS } from "@/lib/constants";
import { useGasStarter } from "@/lib/client/gas";
import { browserPublicClient, useActiveWallet } from "@/lib/client/wallet";
import { TradeSteps, type StepStatus } from "./TradeSteps";

type View = "menu" | "crypto" | "card";

/**
 * Deposit (UI_SPEC §7, FLOWS §1): crypto or card. Card goes through Privy's funding flow, where a
 * licensed provider sells USDT on BNB Chain straight to the user's own wallet; the app never holds
 * it. Balances are polled from chain every 5s.
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
        ) : view === "card" ? (
          "Deposit with card"
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
          <Option title="Deposit with card" subtitle="Debit card or Apple Pay, arrives as USDT" icon={<CreditCard size={24} />} onClick={() => setView("card")} />
          <Option title="Deposit crypto" subtitle="Send USDT on BNB Chain" icon={<QrCode size={24} />} onClick={() => setView("crypto")} />
        </div>
      ) : view === "card" ? (
        <CardView onExit={() => setView("menu")} onDone={onClose} />
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

/**
 * Card deposit: opens Privy's funding flow for USDT on BNB Chain to the user's own wallet, then
 * watches the chain until it lands. A wallet with no BNB then gets the one-time gas starter, so
 * its first trade can pay its own network fees.
 */
function CardView({ onExit, onDone }: { onExit: () => void; onDone: () => void }) {
  const wallet = useActiveWallet();
  const address = wallet?.address as Address | undefined;
  const { addFunds } = useAddFunds();
  const toast = useToast();
  const qc = useQueryClient();
  const gas = useGasStarter(!!address);
  const [phase, setPhase] = useState<CardPhase>("opening");
  const [error, setError] = useState<string | null>(null);
  const [gasStep, setGasStep] = useState<StepStatus | null>(null);
  const baseline = useRef<bigint | null>(null);
  const opened = useRef(false);

  const readUsdt = useCallback(
    async () => (address ? await browserPublicClient().readContract({ address: USDT_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [address] }) : 0n),
    [address],
  );

  // Open the provider's checkout once, after noting the balance it should raise.
  useEffect(() => {
    if (!address || opened.current) return;
    opened.current = true;
    void (async () => {
      baseline.current = await readUsdt().catch(() => 0n);
      try {
        setPhase("paying");
        await addFunds({
          destination: { address, chain: `eip155:${CHAIN_ID}`, asset: USDT_ADDRESS },
          fiat: { source: { defaultAsset: "usd" }, defaultAmount: "50" },
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
  }, [address, addFunds, readUsdt, onExit]);

  // Watch for the USDT to land.
  useEffect(() => {
    if (phase !== "arriving") return;
    let stop = false;
    const tick = async () => {
      const now = await readUsdt().catch(() => null);
      if (stop || now === null || baseline.current === null || now <= baseline.current) return;
      toast({ title: `+${Number(formatUnits(now - baseline.current, 18)).toFixed(2)} USDT received`, tone: "up" });
      qc.invalidateQueries({ queryKey: ["portfolio"] });
      setPhase("arrived");
    };
    void tick();
    const id = setInterval(() => void tick(), 5000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [phase, readUsdt, toast, qc]);

  // Once it has, cover the first network fees if the wallet has no BNB.
  const asked = useRef(false);
  useEffect(() => {
    if (phase !== "arrived" || asked.current) return;
    asked.current = true;
    void gas.refetch().then(({ data }) => {
      if (!data?.available) return;
      if (!data.eligible) {
        setGasStep(data.reason === "has_gas" || data.reason === "claimed" ? { state: "done", note: "You have BNB for network fees" } : { state: "failed", error: "Add a little BNB to pay network fees" });
        return;
      }
      setGasStep({ state: "active", note: "Sending a little BNB for your network fees" });
      gas.claim.mutate(undefined, {
        onSuccess: (r) => setGasStep({ state: "done", note: `${r.amountBnb} BNB added, on us` }),
        onError: (e) => setGasStep({ state: "failed", error: (e as Error).message }),
      });
    });
  }, [phase, gas]);

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
    { key: "usdt", label: "USDT arrives in your wallet" },
    ...(gasStep ? [{ key: "gas", label: "Network fees" }] : []),
  ];
  const states: Record<string, StepStatus> = {
    card: phase === "opening" || phase === "paying" ? { state: "active", note: "Finish checkout in the window" } : { state: "done", note: "Paid" },
    usdt:
      phase === "arriving"
        ? { state: "active", note: "Usually a few minutes. You can close this; it lands either way" }
        : phase === "arrived"
          ? { state: "done", note: "In your wallet" }
          : { state: "idle" },
    ...(gasStep ? { gas: gasStep } : {}),
  };
  const finished = phase === "arrived" && (!gasStep || gasStep.state !== "active");

  return (
    <div>
      <div className="rounded-card bg-surface-2 px-4 pb-3 pt-4">
        <TradeSteps steps={steps} states={states} />
      </div>
      <Button variant={finished ? undefined : "secondary"} className="mt-5 w-full" onClick={onDone}>
        {finished ? "Start trading" : "Close"}
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
        USDT on BNB Chain (BEP-20) only. Keep a little BNB for gas.
      </p>
    </div>
  );
}
