import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { getAddress, type Address } from "viem";
import { BOT_TRADE_CAP_DEFAULT_USD, BOT_TRADE_DAILY_DEFAULT_USD, PHONE_CODE_TTL_MS } from "@/lib/constants";
import { publicEnv, serverEnv } from "@/lib/env";
import type { ProfileRow } from "@/lib/supabase/types";
import { privyClient, type AuthContext } from "@/server/auth";
import { db, must } from "@/server/db";
import { HttpError, rateLimit } from "@/server/http";
import { confirmLink, linkedUser, unlinkPhone } from "@/server/imessage";

// The texting assistant reaches us over more than one channel. A "sender" is whoever is on the
// other end: a phone number in E.164 for iMessage (and the terminal used for testing), or
// `tg:<telegram user id>` for Telegram. Everything here turns a sender into an account, or back.

export type Channel = "imessage" | "telegram";
export type BotUser = { profile: ProfileRow; wallet: Address; sender: string; channel: Channel; number?: string };

const TG = /^tg:(\d{1,20})$/;

export function channelOf(sender: string): Channel {
  return TG.test(sender) ? "telegram" : "imessage";
}

/** Stable, non-reversible stand-in for a sender in rate-limit keys. */
function senderKey(sender: string): string {
  return createHash("sha256").update(sender).digest("hex").slice(0, 16);
}

/** Per-sender budget for bot requests, so one chat can't drain the RPC or the database. */
export async function botRateLimit(sender: string) {
  await rateLimit(`bot:${senderKey(sender)}`, 30, 60);
}

/** The account behind a sender, or null when it isn't linked (or the profile is gone). */
export async function resolveSender(sender: string): Promise<BotUser | null> {
  const tg = TG.exec(sender);
  if (!tg) {
    const u = await linkedUser(sender);
    return u ? { profile: u.profile, wallet: u.wallet, sender: u.phone, channel: "imessage", number: u.number } : null;
  }
  const link = must(await db().from("telegram_links").select("*").eq("telegram_id", tg[1]!).maybeSingle()) as TelegramLinkRow | null;
  if (!link) return null;
  const profile = must(await db().from("profiles").select("*").eq("id", link.profile_id).maybeSingle()) as ProfileRow | null;
  if (!profile || profile.privy_id !== link.privy_id) return null;
  return { profile, wallet: getAddress(link.wallet_address), sender, channel: "telegram" };
}

/** "link <code>" on iMessage, "/start <code>" on Telegram. */
export async function confirmSender(sender: string, code: string): Promise<{ username: string; number?: string }> {
  const tg = TG.exec(sender);
  if (!tg) {
    if (!/^\d{6}$/.test(code)) throw new HttpError(400, "That code didn't work", "bad_code");
    return confirmLink(sender, code);
  }
  return confirmTelegram(tg[1]!, code);
}

export async function unlinkSender(sender: string): Promise<{ wasLinked: boolean; photonUserId: string | null }> {
  const tg = TG.exec(sender);
  if (!tg) return unlinkPhone(sender);
  const rows = must(await db().from("telegram_links").delete().eq("telegram_id", tg[1]!).select("profile_id")) as unknown[];
  return { wasLinked: rows.length > 0, photonUserId: null };
}

// ---------------------------------------------------------------------------
// Telegram linking. The user taps a t.me link that carries a one-time code; whichever Telegram
// account opens it is the one that gets connected.
// ---------------------------------------------------------------------------

type TelegramLinkRow = { profile_id: string; privy_id: string; wallet_address: string; telegram_id: string; linked_at: string };
type TelegramCodeRow = { code: string; profile_id: string; privy_id: string; wallet_address: string; expires_at: string };

export type TelegramStatus = {
  available: boolean;
  bot: string | null;
  linked: { since: string } | null;
  pending: { url: string; expiresAt: string } | null;
};

const telegramBot = () => publicEnv().NEXT_PUBLIC_TELEGRAM_BOT ?? null;

export async function telegramStatus(profileId: string): Promise<TelegramStatus> {
  const bot = telegramBot();
  const [link, code] = await Promise.all([
    db().from("telegram_links").select("*").eq("profile_id", profileId).maybeSingle(),
    db().from("telegram_link_codes").select("*").eq("profile_id", profileId).gt("expires_at", new Date().toISOString()).maybeSingle(),
  ]);
  const l = must(link) as TelegramLinkRow | null;
  const c = must(code) as TelegramCodeRow | null;
  return {
    available: !!(bot && serverEnv().BOT_API_SECRET),
    bot,
    linked: l ? { since: l.linked_at } : null,
    pending: c && bot ? { url: `https://t.me/${bot}?start=${c.code}`, expiresAt: c.expires_at } : null,
  };
}

export async function startTelegramLink(ctx: AuthContext & { profile: ProfileRow }): Promise<TelegramStatus> {
  if (!telegramBot() || !serverEnv().BOT_API_SECRET) throw new HttpError(503, "Telegram isn't set up yet", "telegram_not_configured");
  await rateLimit(`tg:start:${ctx.profile.id}`, 10, 3600);
  must(await db().from("telegram_link_codes").delete().lt("expires_at", new Date().toISOString()));
  must(
    await db().from("telegram_link_codes").upsert(
      {
        code: randomBytes(18).toString("base64url"),
        profile_id: ctx.profile.id,
        privy_id: ctx.privyId,
        wallet_address: ctx.wallet.toLowerCase(),
        expires_at: new Date(Date.now() + PHONE_CODE_TTL_MS).toISOString(),
      },
      { onConflict: "profile_id" },
    ),
  );
  return telegramStatus(ctx.profile.id);
}

async function confirmTelegram(telegramId: string, code: string): Promise<{ username: string }> {
  const bad = () => new HttpError(400, "That link didn't work", "bad_code");
  await rateLimit(`tg:try:${senderKey(telegramId)}`, 5, 600);
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(code)) throw bad();
  const row = must(await db().from("telegram_link_codes").select("*").eq("code", code).maybeSingle()) as TelegramCodeRow | null;
  if (!row || new Date(row.expires_at).getTime() < Date.now()) throw bad();
  const profile = must(await db().from("profiles").select("username, privy_id").eq("id", row.profile_id).maybeSingle()) as Pick<ProfileRow, "username" | "privy_id"> | null;
  if (!profile || profile.privy_id !== row.privy_id) throw bad();
  // The code is single use, and this account replaces any older link on either side.
  must(await db().from("telegram_link_codes").delete().eq("code", code));
  must(await db().from("telegram_links").delete().eq("profile_id", row.profile_id));
  must(await db().from("telegram_links").delete().eq("telegram_id", telegramId));
  must(await db().from("telegram_links").insert({ profile_id: row.profile_id, privy_id: row.privy_id, wallet_address: row.wallet_address, telegram_id: telegramId }));
  console.info("[telegram] linked");
  return { username: profile.username };
}

export async function unlinkTelegramProfile(profileId: string) {
  must(await db().from("telegram_links").delete().eq("profile_id", profileId));
  must(await db().from("telegram_link_codes").delete().eq("profile_id", profileId));
}

// ---------------------------------------------------------------------------
// Text buys: off by default, capped, and only for a wallet the user let the server sign for.
// Settings and checks only. The signing itself is in botTrade.ts.
// ---------------------------------------------------------------------------

export type TradeSettings = { enabled: boolean; capUsd: number; dailyUsd: number };

export async function tradeSettings(profileId: string): Promise<TradeSettings> {
  const row = must(await db().from("assistant_settings").select("*").eq("profile_id", profileId).maybeSingle()) as {
    trade_enabled: boolean;
    trade_cap_usd: string;
    trade_daily_usd: string;
  } | null;
  return row
    ? { enabled: row.trade_enabled, capUsd: Number(row.trade_cap_usd), dailyUsd: Number(row.trade_daily_usd) }
    : { enabled: false, capUsd: BOT_TRADE_CAP_DEFAULT_USD, dailyUsd: BOT_TRADE_DAILY_DEFAULT_USD };
}

/** Whether the server holds the key it needs to sign for users who allow it. */
export function tradingConfigured(): boolean {
  return !!(serverEnv().PRIVY_SIGNER_PRIVATE_KEY && publicEnv().NEXT_PUBLIC_PRIVY_SIGNER_ID);
}

export type SignableWallet = { id: string; address: Address };

/**
 * The user's embedded wallet at `address`, if they have added our signer to it. Asked fresh from
 * Privy every time: this is the check that decides whether the server may sign at all.
 */
export async function signableWallet(privyId: string, address: Address): Promise<SignableWallet | "external" | "not_delegated"> {
  const user = await privyClient().users()._get(privyId);
  for (const a of user.linked_accounts) {
    if (a.type !== "wallet" || !("chain_type" in a) || a.chain_type !== "ethereum" || getAddress(a.address) !== address) continue;
    if (!("connector_type" in a) || a.connector_type !== "embedded") return "external";
    if (!("delegated" in a) || !a.delegated || !("id" in a) || !a.id) return "not_delegated";
    return { id: a.id, address };
  }
  return "external";
}

export async function saveTradeSettings(ctx: AuthContext & { profile: ProfileRow }, next: TradeSettings): Promise<TradeSettings> {
  if (next.enabled) {
    if (!tradingConfigured()) throw new HttpError(503, "Text buys aren't set up yet", "trading_not_configured");
    const w = await signableWallet(ctx.privyId, ctx.wallet);
    if (w === "external") throw new HttpError(409, "Text buys only work with the wallet that was created for you at sign-up, not a connected one.", "external_wallet");
    if (w === "not_delegated") throw new HttpError(409, "Permission wasn't granted. Try turning it on again.", "not_delegated");
  }
  if (next.dailyUsd < next.capUsd) throw new HttpError(400, "The daily limit can't be lower than the limit per buy");
  must(
    await db()
      .from("assistant_settings")
      .upsert({ profile_id: ctx.profile.id, trade_enabled: next.enabled, trade_cap_usd: next.capUsd, trade_daily_usd: next.dailyUsd, updated_at: new Date().toISOString() }, { onConflict: "profile_id" }),
  );
  return tradeSettings(ctx.profile.id);
}
