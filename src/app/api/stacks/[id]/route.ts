import { getAddress } from "viem";
import { handler, HttpError, json } from "@/server/http";
import { componentAssets, getStackSummary } from "@/server/stacks";
import { readStack, vaultAddress } from "@/server/vault";

export const GET = handler(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) throw new HttpError(400, "Bad basket id");
  const stack = await getStackSummary(id);
  if (!stack) throw new HttpError(404, "Basket not found");

  // Recipe comes from chain; the Supabase row is a cache. Refuse to show a mismatch.
  if (vaultAddress()) {
    const chain = await readStack(id);
    if (!chain) throw new HttpError(404, "Basket not found onchain");
    const same =
      chain.assets.length === stack.components.length &&
      chain.assets.every((a, i) => getAddress(a) === getAddress(stack.components[i]!.address) && chain.weightsBps[i] === stack.components[i]!.weight_bps);
    if (!same) throw new HttpError(500, "Cached recipe differs from chain; resync needed");
  }

  const components = await componentAssets(stack);
  const values = components.map((c, i) => {
    const units = stack.launch_units?.[i];
    return units && c.price?.price_usd ? Number(units) * Number(c.price.price_usd) : null;
  });
  const total = values.every((v) => v !== null) ? values.reduce((s, v) => s! + v!, 0)! : null;
  return json(
    {
      stack,
      components: components.map((c, i) => ({
        ...c,
        weightBps: stack.components[i]!.weight_bps,
        valueWeightPct: total && values[i] !== null ? (values[i]! / total) * 100 : null,
      })),
    },
    { cacheSeconds: 5 },
  );
});
