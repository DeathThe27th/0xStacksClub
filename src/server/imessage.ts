import "server-only";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { getAddress, type Address } from "viem";
import { z } from "zod";
import { PHONE_CODE_TTL_MS } from "@/lib/constants";
import { serverEnv } from "@/lib/env";
import { maskPhone, maskPhonesIn, normalizePhone, smsLink } from "@/lib/phone";
import type { ProfileRow } from "@/lib/supabase/types";
import type { AuthContext } from "@/server/auth";
import { db, must } from "@/server/db";
import { HttpError, rateLimit } from "@/server/http";

// ---------------------------------------------------------------------------
// Bot authentication: the bot sends the shared secret in `x-bot-secret`.
// ---------------------------------------------------------------------------

export function requireBot(req: Request) {
  const secret = serverEnv().BOT_API_SECRET;
  if (!secret) throw new HttpError(503, "The bot API isn't set up", "bot_not_configured");
  const a = Buffer.from(req.headers.get("x-bot-secret") ?? "");
  const b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new HttpError(401, "Unauthorized", "unauthorized");
}

/** Stable, non-reversible stand-in for a phone in rate-limit keys. */
function phoneKey(phone: string): string {
  return createHash("sha256").update(phone).digest("hex").slice(0, 16);
}

// ---------------------------------------------------------------------------
// Photon (Spectrum API). On the Free and Pro plans a shared-pool line only talks to phones that are
// registered as "users" of the project, and each user gets their own number from the pool. So a
// phone is registered before its owner texts us, and that call tells us which number they text.
// Source: https://spectrum.photon.codes/openapi/json (POST/DELETE /projects/{id}/users).
// ---------------------------------------------------------------------------

const PHOTON_API = "https://spectrum.photon.codes";

class PhotonError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "PhotonError";
  }
}

export function imessageConfigured(): boolean {
  const env = serverEnv();
  return !!(env.BOT_API_SECRET && env.SPECTRUM_PROJECT_ID && env.SPECTRUM_PROJECT_SECRET);
}

async function photon(method: "POST" | "DELETE", path: string, body?: unknown): Promise<unknown> {
  const env = serverEnv();
  if (!env.SPECTRUM_PROJECT_ID || !env.SPECTRUM_PROJECT_SECRET) throw new HttpError(503, "iMessage isn't set up yet", "imessage_not_configured");
  const auth = Buffer.from(`${env.SPECTRUM_PROJECT_ID}:${env.SPECTRUM_PROJECT_SECRET}`).toString("base64");
  const res = await fetch(`${PHOTON_API}/projects/${env.SPECTRUM_PROJECT_ID}${path}`, {
    method,
    headers: { authorization: `Basic ${auth}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10_000),
  });
  const data = (await res.json().catch(() => null)) as { succeed?: boolean; data?: unknown; message?: string } | null;
  if (!res.ok || !data?.succeed) throw new PhotonError(res.status, data?.message ?? `HTTP ${res.status}`);
  return data.data;
}

const photonUser = z.object({ id: z.string().min(1), assignedPhoneNumber: z.string().regex(/^\+[1-9]\d{6,14}$/) });

/** Idempotent on Photon's side: the same phone returns the same user and assigned number. */
async function registerPhone(phone: string): Promise<{ id: string; assignedNumber: string }> {
  try {
    const u = photonUser.parse(await photon("POST", "/users/", { type: "shared", phoneNumber: phone }));
    return { id: u.id, assignedNumber: u.assignedPhoneNumber };
  } catch (e) {
    if (e instanceof HttpError) throw e;
    const status = e instanceof PhotonError ? e.status : 0;
    const message = maskPhonesIn(e instanceof Error ? e.message : String(e));
    console.error("[photon] register failed", status, message, maskPhone(phone));
    // The shared pool caps users per project (maxSharedUsers) and numbers per phone.
    if (/max|limit|quota|exceed|no .*available|unavailable/i.test(message)) {
      throw new HttpError(503, "iMessage is full right now. Try again later.", "imessage_full");
    }
    throw new HttpError(502, "Couldn't set up iMessage right now. Try again in a minute.", "imessage_unavailable");
  }
}

/** Frees the Photon user slot, unless a verified link still uses it. Never throws. */
export async function releasePhotonUser(photonUserId: string) {
  try {
    const used = must(await db().from("phone_links").select("profile_id").eq("photon_user_id", photonUserId).limit(1)) as unknown[];
    if (used.length) return;
    const pending = must(
      await db().from("phone_link_codes").select("code").eq("photon_user_id", photonUserId).gt("expires_at", new Date().toISOString()).limit(1),
    ) as unknown[];
    if (pending.length) return;
    await photon("DELETE", `/users/${encodeURIComponent(photonUserId)}/`);
  } catch (e) {
    console.error("[photon] release failed", e instanceof PhotonError ? e.status : "", maskPhonesIn(e instanceof Error ? e.message : String(e)));
  }
}

// ---------------------------------------------------------------------------
// Links and codes
// ---------------------------------------------------------------------------

type LinkRow = {
  profile_id: string;
  privy_id: string;
  wallet_address: string;
  phone: string;
  photon_user_id: string;
  assigned_number: string;
  linked_at: string;
};
type CodeRow = Omit<LinkRow, "linked_at"> & { code: string; attempts: number; expires_at: string; created_at: string };

export type IMessageStatus = {
  available: boolean;
  /** `number` is the pool number this user texts: the assistant's number as they see it. */
  linked: { phone: string; since: string; number: string } | null;
  pending: { code: string; expiresAt: string; phone: string; number: string; smsUrl: string } | null;
};

const linkText = (code: string) => `link ${code}`;

export async function imessageStatus(profileId: string): Promise<IMessageStatus> {
  const [link, code] = await Promise.all([
    db().from("phone_links").select("*").eq("profile_id", profileId).maybeSingle(),
    db().from("phone_link_codes").select("*").eq("profile_id", profileId).gt("expires_at", new Date().toISOString()).maybeSingle(),
  ]);
  const l = must(link) as LinkRow | null;
  const c = must(code) as CodeRow | null;
  return {
    available: imessageConfigured(),
    linked: l ? { phone: maskPhone(l.phone), since: l.linked_at, number: l.assigned_number } : null,
    pending: c ? { code: c.code, expiresAt: c.expires_at, phone: maskPhone(c.phone), number: c.assigned_number, smsUrl: smsLink(c.assigned_number, linkText(c.code)) } : null,
  };
}

/** Expired codes leave a registered phone behind on Photon. Free those slots a few at a time. */
async function sweepExpiredCodes() {
  const rows = must(await db().from("phone_link_codes").select("code, photon_user_id").lt("expires_at", new Date().toISOString()).limit(20)) as Pick<
    CodeRow,
    "code" | "photon_user_id"
  >[];
  if (!rows.length) return;
  must(await db().from("phone_link_codes").delete().in("code", rows.map((r) => r.code)));
  await Promise.all(rows.map((r) => releasePhotonUser(r.photon_user_id)));
}

/**
 * Step 1, on the site: the logged-in user names their phone. We register it with Photon and hand
 * back a 6-digit code to text from that phone. Nothing is linked yet.
 */
export async function startLink(ctx: AuthContext & { profile: ProfileRow }, rawPhone: string): Promise<IMessageStatus> {
  if (!imessageConfigured()) throw new HttpError(503, "iMessage isn't set up yet", "imessage_not_configured");
  const phone = normalizePhone(rawPhone);
  if (!phone) throw new HttpError(400, "Enter your number with its country code, like +14155550132", "bad_phone");
  await rateLimit(`imsg:start:${ctx.profile.id}`, 5, 3600);
  await sweepExpiredCodes();

  const previous = must(await db().from("phone_link_codes").delete().eq("profile_id", ctx.profile.id).select("photon_user_id, phone")) as Pick<
    CodeRow,
    "photon_user_id" | "phone"
  >[];
  const user = await registerPhone(phone);
  for (const p of previous) if (p.photon_user_id !== user.id) await releasePhotonUser(p.photon_user_id);

  const row = {
    profile_id: ctx.profile.id,
    privy_id: ctx.privyId,
    wallet_address: ctx.wallet.toLowerCase(),
    phone,
    photon_user_id: user.id,
    assigned_number: user.assignedNumber,
    expires_at: new Date(Date.now() + PHONE_CODE_TTL_MS).toISOString(),
  };
  for (let i = 0; i < 5; i++) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const { error } = await db().from("phone_link_codes").insert({ ...row, code });
    if (!error) return imessageStatus(ctx.profile.id);
    if (error.code !== "23505") must({ data: null, error });
  }
  throw new HttpError(503, "Couldn't create a code. Try again.", "code_unavailable");
}

const BAD_CODE = () => new HttpError(400, "That code didn't work", "bad_code");

/**
 * Step 2, from the bot: "link <code>" arrived from `rawPhone`. The code only works from the phone
 * it was issued for, so knowing a code isn't enough and neither is typing someone else's number.
 */
export async function confirmLink(rawPhone: string, code: string): Promise<{ username: string; number: string }> {
  const phone = normalizePhone(rawPhone);
  if (!phone) throw new HttpError(400, "Bad phone", "bad_phone");
  await rateLimit(`imsg:try:${phoneKey(phone)}`, 5, 600);

  const row = must(await db().from("phone_link_codes").select("*").eq("code", code).maybeSingle()) as CodeRow | null;
  if (!row || new Date(row.expires_at).getTime() < Date.now()) throw BAD_CODE();
  if (row.phone !== phone) {
    // Someone else's phone trying this user's code: five strikes and the code is gone.
    if (row.attempts + 1 >= 5) must(await db().from("phone_link_codes").delete().eq("code", code));
    else must(await db().from("phone_link_codes").update({ attempts: row.attempts + 1 }).eq("code", code));
    throw BAD_CODE();
  }

  const profile = must(await db().from("profiles").select("username, privy_id").eq("id", row.profile_id).maybeSingle()) as Pick<
    ProfileRow,
    "username" | "privy_id"
  > | null;
  if (!profile || profile.privy_id !== row.privy_id) throw BAD_CODE();

  // This phone has just proved itself, so it replaces any older link on either side.
  const replaced = [
    ...(must(await db().from("phone_links").delete().eq("profile_id", row.profile_id).select("photon_user_id")) as Pick<LinkRow, "photon_user_id">[]),
    ...(must(await db().from("phone_links").delete().eq("phone", phone).select("photon_user_id")) as Pick<LinkRow, "photon_user_id">[]),
  ];
  must(
    await db().from("phone_links").insert({
      profile_id: row.profile_id,
      privy_id: row.privy_id,
      wallet_address: row.wallet_address,
      phone,
      photon_user_id: row.photon_user_id,
      assigned_number: row.assigned_number,
    }),
  );
  must(await db().from("phone_link_codes").delete().eq("code", code));
  for (const r of replaced) if (r.photon_user_id !== row.photon_user_id) await releasePhotonUser(r.photon_user_id);
  console.info("[imessage] linked", maskPhone(phone));
  return { username: profile.username, number: row.assigned_number };
}

/** "Disconnect iMessage" on the site: drops the link, any pending code, and the Photon user. */
export async function unlinkProfile(profileId: string) {
  const links = must(await db().from("phone_links").delete().eq("profile_id", profileId).select("photon_user_id")) as Pick<LinkRow, "photon_user_id">[];
  const codes = must(await db().from("phone_link_codes").delete().eq("profile_id", profileId).select("photon_user_id")) as Pick<CodeRow, "photon_user_id">[];
  for (const id of new Set([...links, ...codes].map((r) => r.photon_user_id))) await releasePhotonUser(id);
}

/**
 * "stop" from the bot. Only the link goes here: the bot still has to send its goodbye, and a
 * shared line can't message a phone once its Photon user is gone. The bot releases it afterwards.
 */
export async function unlinkPhone(rawPhone: string): Promise<{ wasLinked: boolean; photonUserId: string | null }> {
  const phone = normalizePhone(rawPhone);
  if (!phone) throw new HttpError(400, "Bad phone", "bad_phone");
  const rows = must(await db().from("phone_links").delete().eq("phone", phone).select("photon_user_id")) as Pick<LinkRow, "photon_user_id">[];
  if (rows.length) console.info("[imessage] unlinked", maskPhone(phone));
  return { wasLinked: rows.length > 0, photonUserId: rows[0]?.photon_user_id ?? null };
}

/** `number` is the pool number this phone texts, i.e. the bot's number as this user sees it. */
export type BotUser = { profile: ProfileRow; wallet: Address; phone: string; number: string };

/** The account behind a phone, or null when it isn't linked (or the profile is gone). */
export async function linkedUser(rawPhone: string): Promise<BotUser | null> {
  const phone = normalizePhone(rawPhone);
  if (!phone) return null;
  const link = must(await db().from("phone_links").select("*").eq("phone", phone).maybeSingle()) as LinkRow | null;
  if (!link) return null;
  const profile = must(await db().from("profiles").select("*").eq("id", link.profile_id).maybeSingle()) as ProfileRow | null;
  if (!profile || profile.privy_id !== link.privy_id) return null;
  return { profile, wallet: getAddress(link.wallet_address), phone, number: link.assigned_number };
}

/** Per-phone budget for bot requests, so one chat can't drain the RPC or the database. */
export async function botRateLimit(rawPhone: string) {
  const phone = normalizePhone(rawPhone);
  if (!phone) throw new HttpError(400, "Bad phone", "bad_phone");
  await rateLimit(`bot:${phoneKey(phone)}`, 30, 60);
}
