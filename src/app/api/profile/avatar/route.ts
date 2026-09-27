import { randomUUID } from "node:crypto";
import { authenticate } from "@/server/auth";
import { db } from "@/server/db";
import { handler, HttpError, json, rateLimit } from "@/server/http";

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

/** Avatar upload to the public `avatars` bucket. Returns the URL to save with PUT /api/profile. */
export const POST = handler(async (req: Request) => {
  const ctx = await authenticate(req);
  await rateLimit(`avatar:${ctx.privyId}`, 10, 3600);
  const form = await req.formData().catch(() => {
    throw new HttpError(400, "Expected multipart form data");
  });
  const file = form.get("image");
  if (!(file instanceof File)) throw new HttpError(400, "Image is required");
  if (!IMAGE_TYPES.includes(file.type)) throw new HttpError(400, "Image must be PNG, JPEG, WebP or GIF");
  if (file.size > 2 * 1024 * 1024) throw new HttpError(400, "Image must be 2MB or smaller");
  const path = `${ctx.privyId.replace(/[^a-zA-Z0-9_-]/g, "_")}/${randomUUID()}.${file.type.split("/")[1]}`;
  const storage = db().storage.from("avatars");
  const up = await storage.upload(path, file, { contentType: file.type });
  if (up.error) throw new HttpError(500, `Upload failed: ${up.error.message}`);
  return json({ url: storage.getPublicUrl(up.data.path).data.publicUrl });
});
