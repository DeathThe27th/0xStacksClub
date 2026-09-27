"use client";

import { usePrivy } from "@privy-io/react-auth";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Mark } from "@/components/brand/Mark";
import { useActiveWallet } from "@/lib/client/wallet";
import { useMe } from "@/lib/client/queries";

/** /app requires login and a finished profile. Sends new users to onboarding. */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { ready, authenticated } = usePrivy();
  const wallet = useActiveWallet();
  const me = useMe();
  const router = useRouter();
  const path = usePathname();

  useEffect(() => {
    if (!ready) return;
    if (!authenticated) router.replace(`/?next=${encodeURIComponent(path)}`);
    else if (me.data && !me.data.profile) router.replace("/onboarding");
  }, [ready, authenticated, me.data, router, path]);

  if (!ready || !authenticated || !wallet || !me.data?.profile) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <Mark size={40} className="animate-live-dot text-text" />
      </div>
    );
  }
  return <>{children}</>;
}
