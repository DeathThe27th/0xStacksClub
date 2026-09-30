"use client";

import { useLogin, usePrivy } from "@privy-io/react-auth";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Landing } from "@/components/landing/Landing";

function Entry() {
  const { ready, authenticated } = usePrivy();
  const router = useRouter();
  const next = useSearchParams().get("next");
  const dest = next?.startsWith("/app") ? next : "/app";
  const [loginError, setLoginError] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);
  const { login } = useLogin({
    onComplete: () => router.replace(dest),
    onError: (e) => setLoginError(e === "exited_auth_flow" ? null : `Sign-in didn't finish (${e}). Try again, or use email.`),
  });
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (ready && authenticated) router.replace(dest);
  }, [ready, authenticated, router, dest]);

  const notice = loginError ? (
    <p role="alert" className="pointer-events-auto max-w-[360px] rounded-card border border-border bg-surface px-4 py-3 text-center text-secondary text-down">
      {loginError}
    </p>
  ) : !ready && slow ? (
    <p className="pointer-events-auto rounded-card border border-border bg-surface px-4 py-3 text-center text-secondary text-text-muted">
      Still starting up.{" "}
      <button className="underline" onClick={() => window.location.reload()}>
        Reload
      </button>
    </p>
  ) : null;

  return <Landing onStart={() => login()} ready={ready} opening={ready && authenticated} notice={notice} />;
}

export default function Page() {
  return (
    <Suspense>
      <Entry />
    </Suspense>
  );
}
