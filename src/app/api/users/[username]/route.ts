import { getAddress } from "viem";
import type { ActivityRow, PublicProfile, StackRow } from "@/lib/supabase/types";
import { maybeAuthenticate } from "@/server/auth";
import { db, must } from "@/server/db";
import { handler, HttpError, json } from "@/server/http";
import { portfolioFor } from "@/server/portfolio";
import { decorateActivity, followCounts, followingIds } from "@/server/social";
import { summarize } from "@/server/stacks";
import { readCreatorClaimable, vaultAddress } from "@/server/vault";

/** Public profile. Dollar amounts on holdings only when it's you or the owner opted in (show_values). */
export const GET = handler(async (req: Request, { params }: { params: Promise<{ username: string }> }) => {
  const username = (await params).username.toLowerCase();
  const profile = must(await db().from("public_profiles").select("*").eq("username", username).maybeSingle()) as PublicProfile | null;
  if (!profile) throw new HttpError(404, "User not found");
  const viewer = await maybeAuthenticate(req);
  const isSelf = viewer?.profile?.id === profile.id;
  const showValues = isSelf || profile.show_values;

  const [counts, stacksRows, activityRows, portfolio, following] = await Promise.all([
    followCounts(profile.id),
    db().from("stacks").select("*").eq("creator_id", profile.id).order("created_at", { ascending: false }).then(must) as Promise<StackRow[]>,
    db().from("activity").select("*").eq("profile_id", profile.id).order("created_at", { ascending: false }).limit(50).then(must) as Promise<ActivityRow[]>,
    portfolioFor(getAddress(profile.wallet_address), profile.id),
    viewer?.profile ? followingIds(viewer.profile.id) : Promise.resolve([] as string[]),
  ]);
  const stacks = await summarize(stacksRows);
  const earnedRaw = stacks.reduce((s, x) => s + BigInt(x.creatorEarnedRaw), 0n);
  const claimableRaw = isSelf && vaultAddress() ? (await readCreatorClaimable(getAddress(profile.wallet_address))).toString() : null;

  const strip = <T extends { valueUsd: number | null; pnlUsd: number | null }>(x: T) => (showValues ? x : { ...x, valueUsd: null, pnlUsd: null });
  return json({
    profile,
    isSelf,
    isFollowing: following.includes(profile.id),
    counts,
    stats: {
      totalUsd: isSelf ? portfolio.totalUsd : null,
      stacksCreated: stacks.length,
      creatorEarnedRaw: earnedRaw.toString(),
    },
    claimableRaw,
    holdings: portfolio.holdings.map(strip),
    positions: portfolio.positions.map(strip).map((p) => (showValues ? p : { ...p, costBasisUsd: null, components: p.components.map((c) => ({ ...c, valueUsd: null })) })),
    stacks,
    activity: await decorateActivity(activityRows),
  });
});
