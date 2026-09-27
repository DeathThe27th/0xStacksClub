import "server-only";
import { BaseError as ViemError } from "viem";
import { BinanceError } from "@/server/binance";

/**
 * Error body safe to return to a client. Binance errors keep their code and message (they're
 * needed to explain failures); RPC errors are reduced to a short reason so URLs and keys in
 * viem's detailed messages never leave the server.
 */
export function publicError(e: unknown): { error: string; message: string; code?: number | null } {
  if (e instanceof BinanceError) return { error: e.name, message: e.message, code: e.code };
  if (e instanceof ViemError) {
    console.error("[rpc]", e.message);
    return { error: "RpcError", message: e.shortMessage };
  }
  console.error(e);
  return { error: "InternalError", message: e instanceof Error ? e.message.split("\n")[0]! : "Unexpected error" };
}
