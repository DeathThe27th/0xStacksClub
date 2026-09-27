"use client";

import { useLogin, usePrivy } from "@privy-io/react-auth";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { Mark } from "@/components/brand/Mark";
import { Button } from "@/components/ui/Button";

function Landing() {
  const { ready, authenticated } = usePrivy();
  const router = useRouter();
  const next = useSearchParams().get("next");
  const dest = next?.startsWith("/app") ? next : "/app";
  const { login } = useLogin({ onComplete: () => router.replace(dest) });

  useEffect(() => {
    if (ready && authenticated) router.replace(dest);
  }, [ready, authenticated, router, dest]);

  return (
    <main className="relative flex min-h-dvh flex-col px-gutter pb-safe pt-safe">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[55dvh] bg-[radial-gradient(60%_60%_at_50%_30%,rgb(var(--primary)/0.22),transparent_70%)]" />
      <div className="relative flex flex-1 flex-col items-center justify-center text-center">
        <Mark size={72} className="text-text" />
        <h1 className="mt-6 text-[34px] font-bold leading-tight tracking-[-0.02em]">StacksClub</h1>
        <p className="mt-3 max-w-[26ch] text-[17px] text-text-muted">Stocks, onchain. Build and share your own Stacks.</p>
      </div>
      <div className="relative pb-8">
        <Button className="w-full" onClick={() => login()} disabled={!ready} loading={!ready}>
          Get started
        </Button>
        <p className="mt-4 text-center text-[12px] leading-5 text-text-dim">
          Tokenized stocks on BNB Chain from bStocks and Ondo. Tokens are issued by those providers and aren&apos;t direct shares. Trading isn&apos;t available in the US, UK, Canada or the Netherlands.
        </p>
      </div>
    </main>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Landing />
    </Suspense>
  );
}
