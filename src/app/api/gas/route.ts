import { requireProfile } from "@/server/auth";
import { claimGasStarter, gasStarterStatus } from "@/server/gasStarter";
import { handler, json } from "@/server/http";

/** Whether the acting wallet can have the one-time gas starter. Never throws for the UI's sake. */
export const GET = handler(async (req: Request) => {
  const ctx = await requireProfile(req);
  try {
    return json(await gasStarterStatus(ctx.profile.id, ctx.wallet));
  } catch (e) {
    // Not set up yet (no table, no key) or the RPC is down: the app just doesn't offer it.
    console.error("gas starter status failed", e);
    return json({ available: false });
  }
});

/** Sends the starter to the acting wallet if it still qualifies (all checks re-run here). */
export const POST = handler(async (req: Request) => {
  const ctx = await requireProfile(req);
  return json(await claimGasStarter(ctx.profile.id, ctx.wallet));
});
