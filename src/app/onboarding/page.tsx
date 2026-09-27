"use client";

import { useCreateWallet, usePrivy } from "@privy-io/react-auth";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Mark } from "@/components/brand/Mark";
import { Button } from "@/components/ui/Button";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { useMe } from "@/lib/client/queries";
import { useActiveWallet } from "@/lib/client/wallet";

/** Single onboarding screen after first login (UI_SPEC §8.6). */
export default function Onboarding() {
  const { ready, authenticated } = usePrivy();
  const wallet = useActiveWallet();
  const me = useMe();
  const router = useRouter();
  const qc = useQueryClient();
  const { createWallet } = useCreateWallet();
  const [slow, setSlow] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (ready && !authenticated) router.replace("/");
    if (me.data?.profile) router.replace("/app");
  }, [ready, authenticated, me.data, router]);

  if (!ready || !authenticated || !wallet || me.isLoading) {
    return (
      <div className="grid min-h-dvh place-items-center px-8 text-center">
        <div className="flex flex-col items-center">
          <Mark size={40} className="animate-live-dot" />
          <p className="mt-5 text-[15px] text-text-muted">{!ready ? "Starting up" : !wallet ? "Creating your wallet" : "Loading your account"}</p>
          {err && <p className="mt-2 text-[13px] text-down">{err}</p>}
          {slow && ready && authenticated && !wallet && (
            <Button size="md" className="mt-6 w-[240px]" onClick={() => createWallet().catch((e: Error) => setErr(e.message))}>
              Create wallet
            </Button>
          )}
        </div>
      </div>
    );
  }
  return (
    <main className="px-gutter pb-10 pt-[calc(env(safe-area-inset-top)+24px)]">
      <Mark size={32} />
      <h1 className="mt-6 text-[28px] font-bold leading-tight">Set up your profile</h1>
      <p className="mt-2 text-[15px] text-text-muted">This is how people see you when you trade and share Stacks.</p>
      <div className="mt-8">
        <ProfileForm
          initial={null}
          submitLabel="Continue"
          onSaved={async () => {
            await qc.invalidateQueries({ queryKey: ["me"] });
            router.replace("/app");
          }}
        />
      </div>
    </main>
  );
}
