import { maybeAuthenticate } from "@/server/auth";
import { clubRole, getStackRow, memberCounts, pinnedPosts } from "@/server/clubs";
import { handler, HttpError, json } from "@/server/http";
import { getStackSummary } from "@/server/stacks";

/** Club header: the Stack, the viewer's role, and pinned posts. Members come from /api/holders. */
export const GET = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) throw new HttpError(400, "Bad Club id");
  const stack = await getStackRow(id);
  const ctx = await maybeAuthenticate(req);
  const [summary, role, pinned, counts] = await Promise.all([getStackSummary(id), clubRole(stack, ctx?.wallet ?? null), pinnedPosts(stack), memberCounts([stack])]);
  return json({ stack: summary, members: counts.get(id) ?? 1, viewer: role, pinned });
});
