import "server-only";
import type { AssetRow } from "@/lib/supabase/types";
import { db, must } from "@/server/db";

const BUCKET = "logos";

/**
 * Copies provider token logos into our own public Storage bucket so the app never depends on a
 * third-party image host loading in the user's browser. Skips logos already mirrored.
 */
export async function mirrorLogos(limit = 500): Promise<{ mirrored: number; skipped: number; failed: string[] }> {
  const storage = db().storage;
  const { data: buckets } = await storage.listBuckets();
  if (!buckets?.some((b) => b.id === BUCKET)) {
    const { error } = await storage.createBucket(BUCKET, { public: true, fileSizeLimit: 1024 * 1024, allowedMimeTypes: ["image/png", "image/jpeg", "image/webp", "image/svg+xml", "image/gif"] });
    if (error && !/already exists/i.test(error.message)) throw new Error(`Couldn't create logos bucket: ${error.message}`);
  }
  const publicBase = storage.from(BUCKET).getPublicUrl("").data.publicUrl;

  const assets = must(await db().from("assets").select("address, logo_url").not("logo_url", "is", null)) as Pick<AssetRow, "address" | "logo_url">[];
  const todo = assets.filter((a) => a.logo_url && !a.logo_url.startsWith(publicBase)).slice(0, limit);
  let mirrored = 0;
  const failed: string[] = [];

  for (let i = 0; i < todo.length; i += 8) {
    await Promise.all(
      todo.slice(i, i + 8).map(async (a) => {
        try {
          const res = await fetch(a.logo_url!, { signal: AbortSignal.timeout(10_000) });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const body = new Uint8Array(await res.arrayBuffer());
          // Some logos are served without a content-type, so identify the format from its bytes.
          const type = sniffImage(body) ?? (res.headers.get("content-type") ?? "").split(";")[0]!;
          if (!type.startsWith("image/")) throw new Error(`not an image (${type || "no content-type"})`);
          const ext = type.split("/")[1]!.replace("svg+xml", "svg");
          const path = `${a.address}.${ext}`;
          const up = await storage.from(BUCKET).upload(path, body, { contentType: type, upsert: true, cacheControl: "604800" });
          if (up.error) throw new Error(up.error.message);
          must(await db().from("assets").update({ logo_url: storage.from(BUCKET).getPublicUrl(path).data.publicUrl }).eq("address", a.address));
          mirrored++;
        } catch (e) {
          failed.push(`${a.address}: ${(e as Error).message}`);
        }
      }),
    );
  }
  return { mirrored, skipped: assets.length - todo.length, failed };
}

function sniffImage(b: Uint8Array): string | null {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image/gif";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45) return "image/webp";
  const head = new TextDecoder().decode(b.slice(0, 256)).trimStart();
  if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))) return "image/svg+xml";
  return null;
}
