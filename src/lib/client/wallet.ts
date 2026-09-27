"use client";

import { usePrivy, useWallets, type ConnectedWallet } from "@privy-io/react-auth";
import { useCallback, useMemo } from "react";
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

export type Signer = {
  address: Address;
  sendTransaction: (tx: { to: Address; data: `0x${string}`; value?: bigint; gas?: bigint }) => Promise<Hash>;
  signTypedData: (payload: {
    domain: Record<string, unknown>;
    types: Record<string, { name: string; type: string }[]>;
    primaryType: string;
    message: Record<string, unknown>;
  }) => Promise<`0x${string}`>;
};

/**
 * One signing path for embedded and external wallets via the EIP-1193 provider. Embedded wallet
 * confirmation UIs are off (showWalletUIs: false), so the progress checklist is the only UI;
 * external wallets show their own prompts.
 */
export function useSigner(): () => Promise<Signer> {
  const wallet = useActiveWallet();
  return useCallback(async () => {
    if (!wallet) throw new Error("No wallet connected");
    await wallet.switchChain(bsc.id);
    const provider = await wallet.getEthereumProvider();
    const address = wallet.address as Address;
    const client = createWalletClient({ account: address, chain: bsc, transport: custom(provider) });
    return {
      address,
      sendTransaction: (tx) => client.sendTransaction({ account: address, chain: bsc, to: tx.to, data: tx.data, value: tx.value ?? 0n, gas: tx.gas }),
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
