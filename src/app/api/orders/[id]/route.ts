import { requireProfile } from "@/server/auth";
import { handler, json } from "@/server/http";
import { pollOrder } from "@/server/intents";

/** RFQ order status normalized to PENDING | FILLED | FAILED | EXPIRED, with balance verification. */
export const GET = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const ctx = await requireProfile(req);
  return json(await pollOrder(ctx, (await params).id));
});
