import { z } from "zod";
import { authenticate } from "@/server/auth";
import { db, DbError, must } from "@/server/db";
import { handler, HttpError, json, rateLimit, readJson } from "@/server/http";
import { followCounts } from "@/server/social";
import { readCreatorClaimable, vaultAddress } from "@/server/vault";

export const GET = handler(async (req: Request) => {
  const ctx = await authenticate(req);
  if (!ctx.profile) return json({ profile: null, wallet: ctx.wallet, wallets: ctx.wallets });
  const { privy_id: _omit, ...profile } = ctx.profile;
  void _omit;
  const claimable = vaultAddress() ? (await readCreatorClaimable(ctx.wallet)).toString() : "0";
  return json({ profile, wallet: ctx.wallet, wallets: ctx.wallets, counts: await followCounts(ctx.profile.id), claimableRaw: claimable });
});

const body = z.object({
  username: z.string().regex(/^[a-z0-9_]{3,20}$/, "3 to 20 lowercase letters, numbers or underscore"),
  displayName: z.string().trim().max(40).optional().nullable(),
  bio: z.string().trim().max(160).optional().nullable(),
  xUrl: z
    .string()
    .trim()
    .regex(/^https:\/\/(x|twitter)\.com\/[A-Za-z0-9_]{1,15}\/?$/, "Must be a https://x.com/<handle> link")
    .optional()
    .nullable()
    .or(z.literal("").transform(() => null)),
  avatarUrl: z.string().url().optional().nullable(),
  showValues: z.boolean().optional(),
});

/** Create (onboarding) or update the caller's profile. Wallet comes from Privy, never the body. */
export const PUT = handler(async (req: Request) => {
  const ctx = await authenticate(req);
  await rateLimit(`profile:${ctx.privyId}`, 20, 60);
  const b = await readJson(req, body);
  if (b.avatarUrl && !b.avatarUrl.startsWith(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/avatars/`)) {
    throw new HttpError(400, "Avatar must be uploaded through /api/profile/avatar");
  }
  const row = {
    privy_id: ctx.privyId,
    wallet_address: (ctx.profile?.wallet_address ?? ctx.wallet).toLowerCase(),
    username: b.username,
    display_name: b.displayName ?? null,
    bio: b.bio ?? null,
    x_url: b.xUrl ?? null,
    ...(b.avatarUrl !== undefined ? { avatar_url: b.avatarUrl } : {}),
    ...(b.showValues !== undefined ? { show_values: b.showValues } : {}),
  };
  try {
    const saved = must(await db().from("profiles").upsert(row, { onConflict: "privy_id" }).select("*").single());
    const { privy_id: _omit, ...profile } = saved as Record<string, unknown>;
    void _omit;
    return json({ profile });
  } catch (e) {
    if (e instanceof DbError && e.code === "23505") throw new HttpError(409, "That username is taken", "username_taken");
    throw e;
  }
});
