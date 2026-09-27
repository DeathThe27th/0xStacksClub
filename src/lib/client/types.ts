// Response shapes of our API routes, for the client. Mirrors src/app/api/**.
import type { AssetPriceRow, AssetRow, PublicProfile, StackRow } from "@/lib/supabase/types";

export type ProfileLite = Pick<PublicProfile, "id" | "username" | "display_name" | "avatar_url">;
export type Friends = { avatars: { id: string; username: string; avatar_url: string | null }[]; count: number } | null;
export type AssetItem = AssetRow & { price: AssetPriceRow | null; friends: Friends };

export type StackSummary = StackRow & {
  creator: Pick<PublicProfile, "id" | "username" | "avatar_url"> | null;
  index: number | null;
  referenceIndex: number | null;
  change: number | null;
  change24h: number | null;
  holders: number;
  creatorEarnedRaw: string;
  friends?: Friends;
};

export type MeResponse = {
  profile: Omit<PublicProfile, "privy_id"> | null;
  wallet: string;
  wallets: string[];
  counts?: { followers: number; following: number };
  claimableRaw?: string;
};

export type Holding = {
  address: string;
  provider: string;
  ticker: string;
  symbol: string;
  name: string;
  logoUrl: string | null;
  units: string;
  unitsDisplay: string;
  price: number | null;
  valueUsd: number | null;
  change24h: number | null;
  avgEntryUsd: number | null;
  pnlUsd: number | null;
  pnlPct: number | null;
};

export type Position = {
  id: number;
  stackId: number;
  stackTicker: string | null;
  stackName: string | null;
  stackImage: string | null;
  openedAt: number;
  components: { address: string; ticker: string; symbol: string; provider: string; units: string; unitsDisplay: string; valueUsd: number | null; logoUrl: string | null }[];
  valueUsd: number | null;
  costBasisUsd: number | null;
  pnlUsd: number | null;
  pnlPct: number | null;
};

export type Portfolio = {
  address: string;
  usdt: { raw: string; display: number };
  bnb: { raw: string; display: number };
  holdings: Holding[];
  positions: Position[];
  totalUsd: number | null;
  change24hUsd: number | null;
};

export type Comment = {
  id: string;
  profile_id: string | null;
  target_type: "asset" | "stack";
  target_id: string;
  parent_id: string | null;
  body: string;
  is_demo: boolean;
  created_at: string;
  author: ProfileLite | null;
  likes: number;
  likedByMe: boolean;
  replies: number;
};

export type Holder = {
  profile: ProfileLite;
  avgEntryUsd: number | null;
  costBasisUsd: number;
  netUnits: string;
  valueUsd: number | null;
  pnlPct: number | null;
  isFriend: boolean;
  latestComment: Comment | null;
};

export type ActivityTarget =
  | { kind: "asset"; asset: Pick<AssetRow, "address" | "ticker" | "symbol" | "provider" | "logo_url"> }
  | { kind: "stack"; stack: Pick<StackRow, "id" | "ticker" | "name" | "image_url"> }
  | null;

export type Activity = {
  id: number;
  profile_id: string | null;
  type: "buy" | "sell" | "redeem" | "create_stack" | "claim";
  usd_amount: string | null;
  created_at: string;
  actor: ProfileLite | null;
  target: ActivityTarget;
};

export type LegStatus = "pending" | "quoted" | "signed" | "submitted" | "filled" | "failed" | "expired" | "skipped";
export type Leg = {
  intent_id: string;
  leg_index: number;
  from_token: string;
  to_token: string;
  amount_in: string;
  expected_out: string | null;
  min_out: string | null;
  actual_out: string | null;
  mode: "SWAP" | "RFQ" | null;
  order_id: string | null;
  tx_hash: string | null;
  status: LegStatus;
  error: string | null;
  attempt: number;
};

export type Intent = {
  id: string;
  kind: "buy_stock" | "buy_stack" | "sell_stock" | "sell_stack" | "redeem";
  stack_id: number | null;
  position_id: number | null;
  asset_address: string | null;
  gross_amount: string | null;
  fee_amount: string | null;
  bps: number | null;
  fee_receipt_id: number | null;
  released_amounts: string[] | null;
  status: "created" | "fee_paid" | "legs_running" | "legs_done" | "depositing" | "done" | "partial" | "failed" | "cancelled";
  error: string | null;
  created_at: string;
  legs: Leg[];
};
