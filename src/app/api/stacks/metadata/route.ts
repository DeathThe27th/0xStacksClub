import { randomUUID } from "node:crypto";
import { z } from "zod";
import { publicEnv } from "@/lib/env";
import { requireProfile } from "@/server/auth";
import { db, must } from "@/server/db";
import { handler, HttpError, json, rateLimit } from "@/server/http";

const fields = z.object({
  name: z.string().trim().min(3).max(32),
  ticker: z.string().regex(/^[A-Z]{2,6}$/),
  description: z.string().trim().max(280).optional().default(""),
});

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

/**
 * Uploads the Stack image to Supabase Storage and stores the metadata JSON next to it. Returns the
 * metadataURI the creator passes to createStack. multipart/form-data: name, ticker, description, image.
 */
export const POST = handler(async (req: Request) => {
  const ctx = await requireProfile(req);
  await rateLimit(`stackmeta:${ctx.profile.id}`, 10, 3600);
  const form = await req.formData().catch(() => {
    throw new HttpError(400, "Expected multipart form data");
  });
  const f = fields.parse({ name: form.get("name"), ticker: form.get("ticker"), description: form.get("description") ?? "" });
  const image = form.get("image");
  if (!(image instanceof File)) throw new HttpError(400, "Image is required");
  if (!IMAGE_TYPES.includes(image.type)) throw new HttpError(400, "Image must be PNG, JPEG, WebP or GIF");
  if (image.size > 2 * 1024 * 1024) throw new HttpError(400, "Image must be 2MB or smaller");

  const id = randomUUID();
  const ext = image.type.split("/")[1];
  const storage = db().storage.from("stacks");
  const up = await storage.upload(`${ctx.profile.id}/${id}.${ext}`, image, { contentType: image.type, upsert: false });
  if (up.error) throw new HttpError(500, `Upload failed: ${up.error.message}`);
  const imageUrl = storage.getPublicUrl(up.data.path).data.publicUrl;

  const metadata = {
    name: f.name,
    ticker: f.ticker,
    description: f.description,
    image: imageUrl,
    creator: ctx.wallet,
    external_url: `${publicEnv().NEXT_PUBLIC_APP_URL}/app`,
  };
  // Metadata JSON lives in its own bucket: the `stacks` bucket only accepts images.
  const metaStorage = await metadataBucket();
  const metaUp = await metaStorage.upload(`${ctx.profile.id}/${id}.json`, new Blob([JSON.stringify(metadata)], { type: "application/json" }), {
    contentType: "application/json",
  });
  if (metaUp.error) throw new HttpError(500, `Metadata upload failed: ${metaUp.error.message}`);
  const metadataURI = metaStorage.getPublicUrl(metaUp.data.path).data.publicUrl;

  must(
    await db().from("stack_metadata").insert({
      metadata_uri: metadataURI,
      profile_id: ctx.profile.id,
      name: f.name,
      ticker: f.ticker,
      description: f.description || null,
      image_url: imageUrl,
    }),
  );
  return json({ metadataURI, imageUrl });
});

let bucketReady = false;
/** Public, JSON-only bucket for Stack metadata, created on first use. */
async function metadataBucket() {
  const storage = db().storage;
  if (!bucketReady) {
    const { data } = await storage.getBucket("stack-metadata");
    if (!data) {
      const { error } = await storage.createBucket("stack-metadata", { public: true, fileSizeLimit: 16 * 1024, allowedMimeTypes: ["application/json"] });
      if (error && !/already exists/i.test(error.message)) throw new HttpError(500, `Couldn't create metadata bucket: ${error.message}`);
    }
    bucketReady = true;
  }
  return storage.from("stack-metadata");
}
