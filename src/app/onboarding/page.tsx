"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Mark } from "@/components/brand/Mark";
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

  useEffect(() => {
    if (ready && !authenticated) router.replace("/");
    if (me.data?.profile) router.replace("/app");
  }, [ready, authenticated, me.data, router]);

  if (!ready || !authenticated || !wallet || me.isLoading) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <Mark size={40} className="animate-live-dot" />
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
