import { z } from "zod";

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "must be a 0x-prefixed 20-byte address");
const url = z.string().url();

/**
 * Client-safe env. Each NEXT_PUBLIC_ var must be referenced literally so Next can inline it.
 */
const publicSchema = z.object({
  NEXT_PUBLIC_PRIVY_APP_ID: z.string().min(1),
  NEXT_PUBLIC_SUPABASE_URL: url,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_BSC_RPC_URL: url,
  NEXT_PUBLIC_USDT_ADDRESS: address,
  // Empty until the vault is deployed. Screens that need it show a "not deployed" state.
  NEXT_PUBLIC_VAULT_ADDRESS: address.optional().or(z.literal("").transform(() => undefined)),
  NEXT_PUBLIC_APP_URL: url,
});

const serverSchema = z.object({
  PRIVY_APP_SECRET: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1),
  BSC_RPC_URL: url,
  BINANCE_WEB3_API_KEY: z.string().min(1),
  BINANCE_WEB3_SECRET_KEY: z.string().min(1),
  PINATA_JWT: z.string().min(1).optional(),
  PINATA_GATEWAY_URL: z.string().min(1).optional(),
  CRON_SECRET: z.string().min(16),
  // Stock news (company-news endpoint). Optional: without it the News section says so.
  FINNHUB_API_KEY: z.string().min(1).optional(),
});

export type PublicEnv = z.infer<typeof publicSchema>;
export type ServerEnv = z.infer<typeof serverSchema> & PublicEnv;

function fail(scope: string, error: z.ZodError): never {
  const lines = error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
  throw new Error(`Invalid ${scope} environment variables:\n${lines.join("\n")}`);
}

function parsePublic(): PublicEnv {
  const result = publicSchema.safeParse({
    NEXT_PUBLIC_PRIVY_APP_ID: process.env.NEXT_PUBLIC_PRIVY_APP_ID,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_BSC_RPC_URL: process.env.NEXT_PUBLIC_BSC_RPC_URL,
    NEXT_PUBLIC_USDT_ADDRESS: process.env.NEXT_PUBLIC_USDT_ADDRESS,
    NEXT_PUBLIC_VAULT_ADDRESS: process.env.NEXT_PUBLIC_VAULT_ADDRESS,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  });
  if (!result.success) fail("public", result.error);
  return result.data;
}

let publicCache: PublicEnv | undefined;
export function publicEnv(): PublicEnv {
  return (publicCache ??= parsePublic());
}

let serverCache: ServerEnv | undefined;
/** Server only. Called from instrumentation.ts at startup so a bad deploy fails loudly. */
export function serverEnv(): ServerEnv {
  if (typeof window !== "undefined") throw new Error("serverEnv() called in the browser");
  if (serverCache) return serverCache;
  const result = serverSchema.safeParse(process.env);
  if (!result.success) fail("server", result.error);
  serverCache = { ...result.data, ...publicEnv() };
  return serverCache;
}
