import "server-only";
import { PrivyClient } from "@privy-io/node";
import { getAddress, isAddress, type Address } from "viem";
import { serverEnv } from "@/lib/env";
import type { ProfileRow } from "@/lib/supabase/types";
import { db, must } from "@/server/db";

let privy: PrivyClient | undefined;
function client() {
  const env = serverEnv();
  return (privy ??= new PrivyClient({ appId: env.NEXT_PUBLIC_PRIVY_APP_ID, appSecret: env.PRIVY_APP_SECRET }));
}

export class AuthError extends Error {
  constructor(
    message: string,
    readonly status = 401,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export type AuthContext = { privyId: string; wallet: Address; wallets: Address[]; profile: ProfileRow | null };

/**
 * Verifies the Privy access token and resolves the acting wallet. The client names which of its
 * wallets it's using (`x-wallet-address`); we only accept it if Privy lists it on this user.
 * Without the header, the user's embedded wallet is used.
 */
export async function authenticate(req: Request): Promise<AuthContext> {
  const header = req.headers.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) throw new AuthError("Missing access token");

  let privyId: string;
  try {
    privyId = (await client().utils().auth().verifyAccessToken(token)).user_id;
  } catch {
    throw new AuthError("Invalid or expired access token");
  }

  const user = await client().users()._get(privyId);
  const wallets = user.linked_accounts
    .filter((a): a is typeof a & { address: string; chain_type: "ethereum" } => a.type === "wallet" && "chain_type" in a && a.chain_type === "ethereum")
    .map((a) => ({
      address: getAddress(a.address),
      embedded: "connector_type" in a && a.connector_type === "embedded",
    }));
  if (wallets.length === 0) throw new AuthError("No EVM wallet on this account yet", 409);

  const requested = req.headers.get("x-wallet-address");
  let wallet: Address;
  if (requested) {
    if (!isAddress(requested)) throw new AuthError("Bad wallet header", 400);
    const match = wallets.find((w) => w.address === getAddress(requested));
    if (!match) throw new AuthError("That wallet isn't linked to this account", 403);
    wallet = match.address;
  } else {
    wallet = (wallets.find((w) => w.embedded) ?? wallets[0]!).address;
  }

  const profile = must(await db().from("profiles").select("*").eq("privy_id", privyId).maybeSingle()) as ProfileRow | null;
  return { privyId, wallet, wallets: wallets.map((w) => w.address), profile };
}

/** Same as authenticate, but the user must have finished onboarding. */
export async function requireProfile(req: Request): Promise<AuthContext & { profile: ProfileRow }> {
  const ctx = await authenticate(req);
  if (!ctx.profile) throw new AuthError("Finish onboarding first", 403);
  return ctx as AuthContext & { profile: ProfileRow };
}

/** Optional auth for public routes that personalise (e.g. "friends who hold this"). */
export async function maybeAuthenticate(req: Request): Promise<AuthContext | null> {
  if (!req.headers.get("authorization")) return null;
  try {
    return await authenticate(req);
  } catch {
    return null;
  }
}
