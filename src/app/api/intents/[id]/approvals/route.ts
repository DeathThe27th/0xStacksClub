import { requireProfile } from "@/server/auth";
import { handler, json, softRateLimit } from "@/server/http";
import { legApprovals, loadIntent } from "@/server/intents";

/** Router approvals the intent's unfilled legs will need, so they can be sent along with the fee. */
export const GET = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const ctx = await requireProfile(req, { cachedProfile: true });
  softRateLimit(`quote:${ctx.profile.id}`, 60, 60);
  const intent = await loadIntent((await params).id, ctx);
  return json({ items: await legApprovals(ctx, intent) }, { headers: { "cache-control": "private, no-store" } });
});
