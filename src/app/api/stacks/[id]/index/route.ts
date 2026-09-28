import { z } from "zod";
import type { StackRow } from "@/lib/supabase/types";
import { db, must } from "@/server/db";
import { handler, HttpError, json } from "@/server/http";
import { indexSeries } from "@/server/stacks";

const query = z.object({ tf: z.enum(["LIVE", "1H", "1D", "1W", "ALL"]).default("1D") });

export const GET = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const id = Number((await params).id);
  const { tf } = query.parse(Object.fromEntries(new URL(req.url).searchParams));
  const stack = must(await db().from("stacks").select("*").eq("id", id).maybeSingle()) as StackRow | null;
  if (!stack) throw new HttpError(404, "Basket not found");
  return json({ tf, points: await indexSeries(stack, tf) }, { cacheSeconds: tf === "LIVE" || tf === "1H" ? 5 : 60 });
});
