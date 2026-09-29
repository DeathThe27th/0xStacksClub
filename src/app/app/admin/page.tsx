"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { createWalletClient, custom, formatUnits, getAddress, type Address, type EIP1193Provider } from "viem";
import { bsc } from "viem/chains";
import { Button } from "@/components/ui/Button";
import { Bar } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/States";
import { shortAddress, usd } from "@/lib/format";
import { vaultAbi } from "@/lib/contracts/vault";
import { vaultAddr } from "@/lib/client/runner";
import { browserPublicClient } from "@/lib/client/wallet";

/**
 * Platform fees: shows what's accrued in the vault and lets the vault admin withdraw it. The
 * contract always pays out to platformFeeRecipient. Signed with the browser wallet (MetaMask etc.)
 * holding the admin key, so you don't have to log into the app with that wallet.
 */
export default function AdminPage() {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const q = useQuery({
    queryKey: ["vault-fees"],
    queryFn: async () => {
      const pc = browserPublicClient();
      const vault = vaultAddr();
      const [accrued, recipient] = await Promise.all([
        pc.readContract({ address: vault, abi: vaultAbi, functionName: "platformAccrued" } as never) as Promise<bigint>,
        pc.readContract({ address: vault, abi: vaultAbi, functionName: "platformFeeRecipient" } as never) as Promise<Address>,
      ]);
      return { vault, accrued, recipient: getAddress(recipient) };
    },
    refetchInterval: 15_000,
  });

  const withdraw = async () => {
    const d = q.data!;
    setBusy(true);
    setNote(null);
    try {
      const eth = (window as unknown as { ethereum?: EIP1193Provider }).ethereum;
      if (!eth) throw new Error("No browser wallet found. Open this page in a browser with MetaMask (or similar) holding the admin wallet.");
      const [from] = (await eth.request({ method: "eth_requestAccounts" })) as Address[];
      if (!from) throw new Error("No account selected in your browser wallet");
      const pc = browserPublicClient();
      const adminRole = (await pc.readContract({ address: d.vault, abi: vaultAbi, functionName: "DEFAULT_ADMIN_ROLE" } as never)) as `0x${string}`;
      const isAdmin = (await pc.readContract({ address: d.vault, abi: vaultAbi, functionName: "hasRole", args: [adminRole, from] } as never)) as boolean;
      if (!isAdmin) throw new Error(`${shortAddress(from)} isn't the vault admin. Switch your browser wallet to the admin account.`);
      const client = createWalletClient({ account: from, chain: bsc, transport: custom(eth) });
      await client.switchChain({ id: bsc.id });
      const hash = await client.writeContract({ address: d.vault, abi: vaultAbi, functionName: "withdrawPlatformFees", args: [d.accrued] } as never);
      const r = await pc.waitForTransactionReceipt({ hash });
      if (r.status !== "success") throw new Error("Withdrawal reverted");
      setNote({ tone: "ok", text: `Sent ${usd(Number(formatUnits(d.accrued, 18)))} USDT to ${shortAddress(d.recipient)}` });
      await q.refetch();
    } catch (e) {
      const m = (e as Error).message;
      setNote({ tone: "err", text: /rejected|denied/i.test(m) ? "You cancelled the signature." : m.split("\n")[0]! });
    } finally {
      setBusy(false);
    }
  };

  if (q.isError) return <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  const d = q.data;
  const amount = d ? usd(Number(formatUnits(d.accrued, 18))) : "";

  return (
    <div className="mx-auto max-w-[560px] px-gutter py-6 lg:px-0">
      <h1 className="text-[24px] font-bold">Platform fees</h1>
      <p className="mt-1 text-secondary text-text-muted">Fees collect in the vault until the admin withdraws them to the fee wallet.</p>
      {!d ? (
        <Bar className="mt-6 h-32 w-full rounded-card" />
      ) : (
        <>
          <dl className="mt-6 space-y-3 rounded-card border border-border bg-surface p-5 text-[15px]">
            <Row label="Waiting in the vault">
              <span className="text-[20px] font-semibold tnum">{amount}</span>
            </Row>
            <Row label="Paid out to">
              <a href={`https://bscscan.com/address/${d.recipient}`} target="_blank" rel="noreferrer" className="text-link">
                {shortAddress(d.recipient)}
              </a>
            </Row>
          </dl>
          <Button className="mt-6 w-full" loading={busy} disabled={busy || d.accrued === 0n} onClick={() => void withdraw()}>
            {d.accrued === 0n ? "Nothing to withdraw" : `Withdraw ${amount} USDT`}
          </Button>
          <p className="mt-2 text-center text-[13px] text-text-muted">Sign with the admin wallet in MetaMask. It needs a little BNB for gas.</p>
          {note && <p className={note.tone === "ok" ? "mt-4 text-center text-[14px] text-up" : "mt-4 text-center text-[14px] text-down"}>{note.text}</p>}
        </>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-text-muted">{label}</dt>
      <dd className="text-right tnum">{children}</dd>
    </div>
  );
}
