import { publicEnv } from "@/lib/env";
import type { StackRow } from "@/lib/supabase/types";
import { db, must } from "@/server/db";
import { handler, HttpError, json } from "@/server/http";
import { readPosition } from "@/server/vault";

/** ERC-721 metadata for a position NFT (tokenURI points here). */
export const GET = handler(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const id = Number((await params).id);
  const p = await readPosition(id);
  if (!p) throw new HttpError(404, "Position not found");
  const stack = must(await db().from("stacks").select("ticker, name, image_url, components").eq("id", p.stackId).maybeSingle()) as Pick<
    StackRow,
    "ticker" | "name" | "image_url" | "components"
  > | null;
  return json(
    {
      name: `StacksClub Position #${id}`,
      description: `A non-transferable position in ${stack ? `$${stack.ticker} (${stack.name})` : `Stack #${p.stackId}`} holding the exact stock tokens bought. Weights are not rebalanced.`,
      image: stack?.image_url ?? `${publicEnv().NEXT_PUBLIC_APP_URL}/icon.svg`,
      external_url: `${publicEnv().NEXT_PUBLIC_APP_URL}/app/position/${id}`,
      attributes: [
        { trait_type: "Stack", value: stack?.ticker ?? String(p.stackId) },
        { trait_type: "Opened", display_type: "date", value: p.openedAt },
        ...p.assets.map((a, i) => ({ trait_type: stack?.components[i]?.symbol ?? a, value: p.balances[i]!.toString() })),
      ],
    },
    { cacheSeconds: 60 },
  );
});
