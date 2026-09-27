import { hexToString, isHex } from "viem";
import { z } from "zod";

const typedData = z.object({
  types: z.record(z.string(), z.array(z.object({ name: z.string(), type: z.string() }))),
  primaryType: z.string(),
  domain: z.record(z.string(), z.unknown()),
  message: z.record(z.string(), z.unknown()),
});
export type Eip712Payload = z.infer<typeof typedData>;

/**
 * `rfq.typedDataToSign` is documented as "serialized as a hex string (or JSON-encoded string)".
 * Accept JSON, or hex-encoded UTF-8 JSON. Anything else is an undocumented shape: throw.
 */
export function parseTypedDataToSign(raw: string): Eip712Payload {
  let text = raw.trim();
  if (isHex(text) && !text.startsWith("{")) {
    try {
      text = hexToString(text);
    } catch {
      throw new Error("typedDataToSign is hex but not UTF-8 text; shape not covered by the docs");
    }
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("typedDataToSign is neither JSON nor hex-encoded JSON; shape not covered by the docs");
  }
  const parsed = typedData.safeParse(json);
  if (!parsed.success) {
    throw new Error(`typedDataToSign is not an EIP-712 payload: ${parsed.error.issues[0]?.message}`);
  }
  return parsed.data;
}
