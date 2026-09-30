import { z } from "zod";
import { isPhone } from "./mask.js";

const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const opt = <T extends z.ZodType>(t: T) => z.preprocess(blank, t.optional());

const schema = z
  .object({
    SITE_URL: z.string().url(),
    BOT_API_SECRET: z.string().min(32),
    BOT_PROVIDER: z.preprocess(blank, z.enum(["imessage", "terminal"]).default("imessage")),
    SPECTRUM_PROJECT_ID: opt(z.string().uuid()),
    SPECTRUM_PROJECT_SECRET: opt(z.string().min(1)),
    GEMINI_API_KEY: opt(z.string().min(1)),
    GEMINI_MODEL: z.preprocess(blank, z.string().default("gemini-3.5-flash-lite")),
    GEMINI_FALLBACK_MODEL: z.preprocess(blank, z.string().default("gemini-3.1-flash-lite")),
    // Telegram bot token from @BotFather. With it set, the bot also answers on Telegram.
    SPECTRUM_TELEGRAM_BOT_TOKEN: opt(z.string().regex(/^\d+:[A-Za-z0-9_-]{30,}$/, "doesn't look like a BotFather token")),
    TERMINAL_PHONE: opt(z.string().refine(isPhone, "must be E.164, like +14155550132")),
    DAILY_SEND_LIMIT: z.preprocess(blank, z.coerce.number().int().min(1).max(5000).default(4500)),
    LOG_LEVEL: z.preprocess(blank, z.enum(["debug", "info", "warn", "error"]).default("info")),
  })
  .superRefine((v, ctx) => {
    if (v.BOT_PROVIDER === "imessage") {
      for (const k of ["SPECTRUM_PROJECT_ID", "SPECTRUM_PROJECT_SECRET"] as const) {
        if (!v[k]) ctx.addIssue({ code: "custom", path: [k], message: "required for the iMessage provider" });
      }
    } else if (!v.TERMINAL_PHONE) {
      ctx.addIssue({ code: "custom", path: ["TERMINAL_PHONE"], message: "required for the terminal provider" });
    }
  });

export type Config = z.infer<typeof schema>;

/** Reads and validates the environment. Names what's wrong without echoing any value. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const r = schema.safeParse(env);
  if (!r.success) {
    const lines = r.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid bot environment (bot/.env):\n${lines.join("\n")}`);
  }
  return { ...r.data, SITE_URL: r.data.SITE_URL.replace(/\/+$/, "") };
}
