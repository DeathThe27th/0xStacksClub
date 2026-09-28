"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity as ActivityIcon, Gift, Layers, LogOut, Pencil, Settings, Wallet } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useState } from "react";
import { encodeFunctionData } from "viem";
import { Overview } from "@/components/desktop/Overview";
import { StackRow } from "@/components/market/Rows";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { DepositSheet } from "@/components/trade/DepositSheet";
import { ActivityItem } from "@/components/social/ActivityItem";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Change } from "@/components/ui/Change";
import { ProviderPill } from "@/components/ui/ProviderPill";
import { PullToRefresh } from "@/components/ui/PullToRefresh";
import { Sheet } from "@/components/ui/Sheet";
import { Bar } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { Switch } from "@/components/ui/Switch";
import { ThemeSwitch } from "@/components/ui/ThemeSwitch";
import { Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { TokenLogo } from "@/components/ui/TokenLogo";
import { cn } from "@/lib/cn";
import { vaultAbi } from "@/lib/contracts/vault";
import { units, usd } from "@/lib/format";
import { useApi } from "@/lib/client/api";
import { vaultAddr } from "@/lib/client/runner";
import type { Activity, Holding, MeResponse, Position, StackSummary } from "@/lib/client/types";
import { browserPublicClient, useSigner } from "@/lib/client/wallet";

type UserResponse = {
  profile: NonNullable<MeResponse["profile"]>;
  isSelf: boolean;
  isFollowing: boolean;
  counts: { followers: number; following: number };
  stats: { totalUsd: number | null; stacksCreated: number; creatorEarnedRaw: string };
  claimableRaw: string | null;
  holdings: Holding[];
  positions: Position[];
  stacks: StackSummary[];
  activity: Activity[];
};

function XIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden fill="currentColor">
      <path d="M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.2L2 3h6.33l4.37 5.78L17.75 3Zm-1.08 16.2h1.7L7.4 4.73H5.57l11.1 14.47Z" />
    </svg>
  );
}

export default function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = use(params);
  const api = useApi();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"holdings" | "stacks" | "activity">("holdings");
  const [settings, setSettings] = useState<"menu" | "edit" | null>(null);
  const [depositOpen, setDepositOpen] = useState(false);
  const q = useQuery({ queryKey: ["user", username], queryFn: () => api<UserResponse>(`/api/users/${username}`) });

  const follow = useMutation({
    mutationFn: () => api("/api/follow", { method: q.data?.isFollowing ? "DELETE" : "POST", json: { profileId: q.data!.profile.id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["user", username] }),
  });

  if (q.isError) return <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  const u = q.data;
  const claimable = u?.claimableRaw ? BigInt(u.claimableRaw) : 0n;

  return (
    <PullToRefresh onRefresh={() => q.refetch()}>
      <div className={cn("lg:mx-auto lg:pt-4", u?.isSelf ? "lg:max-w-[1080px]" : "lg:max-w-[760px]")}>
      <header className="px-gutter pt-5 lg:px-0">
        <div className="flex items-start justify-between">
          {u ? <Avatar src={u.profile.avatar_url} name={u.profile.username} size={72} /> : <Bar className="h-[72px] w-[72px] rounded-full" />}
          {u?.isSelf && (
            <button onClick={() => setSettings("menu")} aria-label="Settings" className="press grid h-11 w-11 place-items-center text-text-muted hover:text-text">
              <Settings size={22} />
            </button>
          )}
        </div>
        {u ? (
          <>
            <h1 className="mt-3 text-[22px] font-bold leading-tight">{u.profile.display_name ?? u.profile.username}</h1>
            <p className="flex items-center gap-2 text-[15px] text-text-muted">
              @{u.profile.username}
              {u.profile.x_url && (
                <a href={u.profile.x_url} target="_blank" rel="noreferrer nofollow" aria-label="X profile" className="text-text-muted hover:text-text">
                  <XIcon />
                </a>
              )}
            </p>
            {u.profile.bio && <p className="mt-3 max-w-[40ch] text-[15px]">{u.profile.bio}</p>}
            <p className="mt-3 flex gap-4 text-[15px]">
              <span>
                <b className="font-semibold">{u.counts.followers}</b> <span className="text-text-muted">Followers</span>
              </span>
              <span>
                <b className="font-semibold">{u.counts.following}</b> <span className="text-text-muted">Following</span>
              </span>
            </p>
            <div className="mt-4">
              {u.isSelf ? (
                <Button variant="secondary" size="md" className="w-full" onClick={() => setSettings("edit")}>
                  Edit profile
                </Button>
              ) : (
                <Button variant={u.isFollowing ? "secondary" : "primary"} size="md" className="w-full" loading={follow.isPending} onClick={() => follow.mutate()}>
                  {u.isFollowing ? "Following" : "Follow"}
                </Button>
              )}
            </div>
          </>
        ) : (
          <div className="mt-3 space-y-2">
            <Bar className="h-6 w-40" />
            <Bar className="h-4 w-24" />
          </div>
        )}
      </header>

      {/* Desktop, your own profile: portfolio, holdings table, top trades and your people's activity. */}
      {u?.isSelf && (
        <div className="hidden lg:block">
          <Overview onDeposit={() => setDepositOpen(true)} />
        </div>
      )}

      {u && (
        <section className={cn("mt-5 grid grid-cols-3 gap-2 px-gutter lg:px-0", u.isSelf && "lg:hidden")}>
          <Stat label="Total value" value={u.isSelf ? usd(u.stats.totalUsd) : "Private"} />
          <Stat label="Stacks created" value={String(u.stats.stacksCreated)} />
          <Stat label="Creator earnings" value={usd(Number(BigInt(u.stats.creatorEarnedRaw)) / 1e18)} />
        </section>
      )}

      {u?.isSelf && claimable > 0n && <ClaimCard raw={claimable} onDone={() => q.refetch()} />}

      <div className="mt-5 px-gutter lg:px-0">
        <Tabs
          tabs={[
            { id: "holdings", label: "Holdings" },
            { id: "stacks", label: "Stacks" },
            { id: "activity", label: "Activity" },
          ]}
          value={tab}
          onChange={setTab}
        />
        {!u ? (
          <div className="pt-4">
            <Bar className="h-16 w-full" />
          </div>
        ) : tab === "holdings" ? (
          <Holdings u={u} />
        ) : tab === "stacks" ? (
          u.stacks.length ? (
            <div className="pt-2">
              {u.stacks.map((s) => (
                <StackRow key={s.id} s={s} />
              ))}
            </div>
          ) : (
            <EmptyState icon={<Layers size={24} />} title={u.isSelf ? "You haven't made a Stack yet" : "No Stacks yet"} action={u.isSelf ? <Link href="/app/create"><Button size="md">Create a Stack</Button></Link> : undefined} />
          )
        ) : u.activity.length ? (
          <div className="divide-y divide-border">
            {u.activity.map((a) => (
              <ActivityItem key={a.id} a={a} showActor={false} />
            ))}
          </div>
        ) : (
          <EmptyState icon={<ActivityIcon size={24} />} title="No activity yet" />
        )}
      </div>

      {u?.isSelf && (
        <SettingsSheet
          mode={settings}
          setMode={setSettings}
          profile={u.profile}
          onSaved={() => {
            void qc.invalidateQueries({ queryKey: ["me"] });
            void q.refetch();
          }}
        />
      )}
      {u?.isSelf && <DepositSheet open={depositOpen} onClose={() => setDepositOpen(false)} />}
      </div>
    </PullToRefresh>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card bg-surface px-3 py-3">
      <p className="truncate text-[17px] font-semibold tnum">{value}</p>
      <p className="mt-0.5 text-[12px] text-text-muted">{label}</p>
    </div>
  );
}

function Holdings({ u }: { u: UserResponse }) {
  if (!u.holdings.length && !u.positions.length) return <EmptyState icon={<Wallet size={24} />} title="No holdings yet" />;
  return (
    <div className="pt-2">
      {u.positions.map((p) => (
        <Link key={p.id} href={`/app/position/${p.id}`} className="press -mx-2 flex h-row items-center gap-3 rounded-card px-2 hover:bg-surface/60">
          <TokenLogo src={p.stackImage} label={p.stackTicker ?? "?"} size={48} />
          <div className="min-w-0 flex-1">
            <p className="text-row font-semibold uppercase">${p.stackTicker}</p>
            <p className="text-secondary text-text-muted">Position #{p.id} · {p.components.length} stocks</p>
          </div>
          <div className="text-right">
            <p className="text-row font-medium tnum">{p.valueUsd !== null ? usd(p.valueUsd) : ""}</p>
            <Change value={p.pnlPct} className="justify-end" />
          </div>
        </Link>
      ))}
      {u.holdings.map((h) => (
        <Link key={h.address} href={`/app/stock/${h.provider}/${h.address}`} className="press -mx-2 flex h-row items-center gap-3 rounded-card px-2 hover:bg-surface/60">
          <TokenLogo src={h.logoUrl} label={h.ticker} size={48} />
          <div className="min-w-0 flex-1">
            <p className="text-row font-semibold uppercase">{h.ticker}</p>
            <p className="flex items-center gap-1.5 text-secondary text-text-muted">
              <ProviderPill provider={h.provider} /> {units(h.unitsDisplay, 4)} {h.symbol}
            </p>
          </div>
          <div className="text-right">
            <p className="text-row font-medium tnum">{h.valueUsd !== null ? usd(h.valueUsd) : ""}</p>
            <Change value={h.pnlPct ?? h.change24h} className="justify-end" />
          </div>
        </Link>
      ))}
    </div>
  );
}

/** Claim card: amount read from chain, never Supabase (FLOWS §9). */
function ClaimCard({ raw, onDone }: { raw: bigint; onDone: () => void }) {
  const getSigner = useSigner();
  const api = useApi();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const claim = async () => {
    setBusy(true);
    setError(null);
    try {
      const signer = await getSigner();
      const hash = await signer.sendTransaction({ to: vaultAddr(), data: encodeFunctionData({ abi: vaultAbi, functionName: "claimCreatorFees" }) });
      const r = await browserPublicClient().waitForTransactionReceipt({ hash });
      if (r.status !== "success") throw new Error("Claim reverted");
      await api("/api/sync", { method: "POST", json: { txHash: hash } }).catch(() => undefined);
      toast({ title: `Claimed ${usd(Number(raw) / 1e18)}`, body: "Creator fees sent to your wallet", tone: "up" });
      onDone();
    } catch (e) {
      setError(/rejected|denied/i.test((e as Error).message) ? "You cancelled the signature." : (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="mx-gutter mt-4 flex items-center gap-3 rounded-card border border-up/30 bg-up/10 p-4 lg:mx-0">
      <Gift size={22} className="shrink-0 text-up" />
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold">Creator fees ready</p>
        <p className="text-[13px] text-text-muted">{error ?? "25% of the buy fee on your Stacks"}</p>
      </div>
      <Button size="md" className="bg-up text-bg hover:bg-up/90" loading={busy} onClick={claim}>
        Claim {usd(Number(raw) / 1e18)}
      </Button>
    </section>
  );
}

function SettingsSheet({
  mode,
  setMode,
  profile,
  onSaved,
}: {
  mode: "menu" | "edit" | null;
  setMode: (m: "menu" | "edit" | null) => void;
  profile: UserResponse["profile"];
  onSaved: () => void;
}) {
  const { logout, exportWallet, user } = usePrivy();
  const api = useApi();
  const router = useRouter();
  const [showValues, setShowValues] = useState(profile.show_values);
  const hasEmbedded = !!user?.linkedAccounts.some((a) => a.type === "wallet" && "walletClientType" in a && a.walletClientType === "privy");
  return (
    <Sheet open={mode !== null} onClose={() => setMode(null)} title={mode === "edit" ? "Edit profile" : "Settings"}>
      {mode === "edit" ? (
        <ProfileForm
          initial={profile}
          submitLabel="Save"
          onSaved={() => {
            onSaved();
            setMode(null);
          }}
        />
      ) : (
        <div className="space-y-2">
          <div className="rounded-card bg-surface-2 p-4">
            <p className="mb-3 text-[15px] font-semibold">Appearance</p>
            <ThemeSwitch className="bg-surface" />
          </div>
          <button onClick={() => setMode("edit")} className="press flex h-14 w-full items-center gap-3 rounded-card bg-surface-2 px-4 text-[16px]">
            <Pencil size={18} /> Edit profile
          </button>
          <label className="flex h-14 items-center gap-3 rounded-card bg-surface-2 px-4 text-[16px]">
            <span className="flex-1">Show values on my profile</span>
            <Switch
              checked={showValues}
              label="Show values"
              onChange={async (v) => {
                setShowValues(v);
                await api("/api/profile", { method: "PUT", json: { username: profile.username, displayName: profile.display_name, bio: profile.bio, xUrl: profile.x_url, showValues: v } }).catch(() => setShowValues(!v));
                onSaved();
              }}
            />
          </label>
          {hasEmbedded && (
            <button onClick={() => exportWallet()} className="press flex h-14 w-full items-center gap-3 rounded-card bg-surface-2 px-4 text-[16px]">
              <Wallet size={18} /> Export wallet
            </button>
          )}
          <button
            onClick={async () => {
              await logout();
              router.replace("/");
            }}
            className="press flex h-14 w-full items-center gap-3 rounded-card bg-surface-2 px-4 text-[16px] text-down"
          >
            <LogOut size={18} /> Log out
          </button>
        </div>
      )}
    </Sheet>
  );
}
