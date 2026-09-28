"use client";

import { useCreateWallet, usePrivy } from "@privy-io/react-auth";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Wordmark } from "@/components/brand/Wordmark";
import { Button } from "@/components/ui/Button";
import { useActiveWallet } from "@/lib/client/wallet";
import { useMe } from "@/lib/client/queries";

/**
 * /app requires login and a finished profile. Sends new users to onboarding. Never spins
 * silently: after a few seconds it says what it's waiting for and offers a way out.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, user, logout } = usePrivy();
  const { createWallet } = useCreateWallet();
  const wallet = useActiveWallet();
  const me = useMe();
  const router = useRouter();
  const path = usePathname();
  const [slow, setSlow] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (!authenticated) router.replace(`/?next=${encodeURIComponent(path)}`);
    else if (me.data && !me.data.profile) router.replace("/onboarding");
  }, [ready, authenticated, me.data, router, path]);

  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(t);
  }, []);

  const hasEvmWallet = !!user?.linkedAccounts.some((a) => a.type === "wallet" && "chainType" in a && a.chainType === "ethereum");

  if (ready && authenticated && wallet && me.data?.profile) return <>{children}</>;

  const status = !ready
    ? "Starting up"
    : !authenticated
      ? "Taking you to sign in"
      : !wallet
        ? hasEvmWallet
          ? "Connecting your wallet"
          : "Creating your wallet"
        : me.isError
          ? `Couldn't load your account: ${(me.error as Error).message}`
          : "Loading your account";

  return (
    <div className="grid min-h-dvh place-items-center px-8 text-center">
      <div className="flex flex-col items-center">
        <Wordmark size={28} className={me.isError ? "text-text-muted" : "animate-live-dot text-text"} />
        <p className="mt-5 text-[15px] text-text-muted">{status}</p>
        {walletError && <p className="mt-2 text-[13px] text-down">{walletError}</p>}
        {(slow || me.isError) && (
          <div className="mt-6 flex w-[240px] flex-col gap-2">
            {authenticated && !wallet && !hasEvmWallet && (
              <Button
                size="md"
                onClick={() =>
                  createWallet().catch((e: Error) => setWalletError(e.message))
                }
              >
                Create wallet
              </Button>
            )}
            <Button size="md" variant="secondary" onClick={() => (me.isError ? me.refetch() : window.location.reload())}>
              Try again
            </Button>
            {authenticated && (
              <Button
                size="md"
                variant="ghost"
                onClick={async () => {
                  await logout();
                  router.replace("/");
                }}
              >
                Log out
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
