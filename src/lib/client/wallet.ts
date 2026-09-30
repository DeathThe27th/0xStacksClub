"use client";

import { usePrivy, useWallets, type ConnectedWallet } from "@privy-io/react-auth";
import { useCallback, useMemo } from "react";
import type { Signer } from "@/lib/runner";
import { createPublicClient, createWalletClient, custom, http, type Address, type Hash } from "viem";
import { bsc } from "viem/chains";
import { publicEnv } from "@/lib/env";

let pc: ReturnType<typeof createPublicClient> | undefined;
export function browserPublicClient() {
  return (pc ??= createPublicClient({ chain: bsc, transport: http(publicEnv().NEXT_PUBLIC_BSC_RPC_URL), batch: { multicall: true } }));
}

/** The wallet the user acts with: the embedded wallet unless they only have an external one. */
export function useActiveWallet(): ConnectedWallet | null {
  const { wallets } = useWallets();
  const { user } = usePrivy();
  return useMemo(() => {
    const embedded = wallets.find((w) => w.walletClientType === "privy");
    if (embedded) return embedded;
    const linked = new Set((user?.linkedAccounts ?? []).flatMap((a) => (a.type === "wallet" && "address" in a ? [a.address.toLowerCase()] : [])));
    return wallets.find((w) => linked.has(w.address.toLowerCase())) ?? wallets[0] ?? null;
  }, [wallets, user]);
}

export type { Signer } from "@/lib/runner";

/**
 * One signing path for embedded and external wallets via the EIP-1193 provider. Embedded wallet
 * confirmation UIs are off (showWalletUIs: false), so the progress checklist is the only UI;
 * external wallets show their own prompts.
 */
export function useSigner(): () => Promise<Signer> {
  const wallet = useActiveWallet();
  return useCallback(async () => {
    if (!wallet) throw new Error("No wallet connected");
    // Skip the round trip when the wallet is already on BSC.
    if (wallet.chainId !== `eip155:${bsc.id}`) await wallet.switchChain(bsc.id);
    const provider = await wallet.getEthereumProvider();
    const address = wallet.address as Address;
    const client = createWalletClient({ account: address, chain: bsc, transport: custom(provider) });
    const sendTransaction: Signer["sendTransaction"] = (tx) =>
      client.sendTransaction({ account: address, chain: bsc, to: tx.to, data: tx.data, value: tx.value ?? 0n, gas: tx.gas, nonce: tx.nonce });

    const oneByOne = async (txs: Parameters<NonNullable<Signer["sendBatch"]>>[0]) => {
      const hashes: Hash[] = [];
      for (const tx of txs) hashes.push(await sendTransaction(tx));
      return hashes;
    };

    /**
     * Embedded wallet only. Asking the wallet to send a transaction costs a few seconds each (it
     * prices, signs and broadcasts through Privy). Here we price them ourselves, have the wallet
     * sign them all at once, and broadcast the signed transactions through our own RPC. If the
     * wallet can't sign this way, nothing has been sent yet and we fall back to one at a time.
     */
    const sendBatch: Signer["sendBatch"] = async (txs) => {
      const pc = browserPublicClient();
      let signed: `0x${string}`[];
      try {
        const gasPrice = await pc.getGasPrice();
        const priced = await Promise.all(
          txs.map(async (tx) => ({
            ...tx,
            // A tx that follows an approval in the same batch always comes with its gas limit set.
            gas: tx.gas ?? ((await pc.estimateGas({ account: address, to: tx.to, data: tx.data, value: tx.value ?? 0n })) * 13n) / 10n,
          })),
        );
        signed = await Promise.all(
          priced.map((tx) => client.signTransaction({ account: address, chain: bsc, to: tx.to, data: tx.data, value: tx.value ?? 0n, gas: tx.gas, nonce: tx.nonce, gasPrice, type: "legacy" })),
        );
      } catch (e) {
        console.warn("[wallet] batch signing unavailable, sending one at a time", e instanceof Error ? e.message.split("\n")[0] : e);
        return oneByOne(txs);
      }
      const hashes: Hash[] = [];
      for (const [i, raw] of signed.entries()) {
        try {
          hashes.push(await pc.sendRawTransaction({ serializedTransaction: raw }));
        } catch (e) {
          // Nothing is out yet if the first one was refused, so the normal path can still take over.
          if (i === 0) {
            console.warn("[wallet] direct broadcast refused, sending one at a time", e instanceof Error ? e.message.split("\n")[0] : e);
            return oneByOne(txs);
          }
          throw e;
        }
      }
      return hashes;
    };

    return {
      address,
      sendTransaction,
      ...(wallet.walletClientType === "privy" ? { sendBatch } : {}),
      signTypedData: async (p) => {
        // EIP712Domain is implied by viem; strip it if the payload includes it.
        const { EIP712Domain: _d, ...types } = p.types;
        void _d;
        // Types come from Binance at runtime, so they can't be statically typed here.
        const args = { account: address, domain: p.domain, types, primaryType: p.primaryType, message: p.message };
        return client.signTypedData(args as unknown as Parameters<typeof client.signTypedData>[0]);
      },
    };
  }, [wallet]);
}
