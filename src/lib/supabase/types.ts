// Row types for supabase/migrations/0001_init.sql. Keep in sync with the migration.

export type ProfileRow = {
  id: string;
  privy_id: string;
  wallet_address: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  x_url: string | null;
  show_values: boolean;
  created_at: string;
};
export type PublicProfile = Omit<ProfileRow, "privy_id">;

export type AssetRow = {
  provider: "bstock" | "ondo";
  chain_id: number;
  address: string;
  ticker: string;
  symbol: string;
  name: string;
  logo_url: string | null;
  decimals: number;
  share_multiplier: string | null;
  can_browse: boolean;
  can_stack: boolean;
  can_trade: boolean;
  vault_ok: boolean | null;
  route_check: string | null;
  source: string;
  verified_at: string | null;
};

export type AssetPriceRow = {
  chain_id: number;
  address: string;
  price_usd: string | null;
  reference_price_usd: string | null;
  change_24h: string | null;
  market_cap: string | null;
  volume_24h: string | null;
  market_open: boolean | null;
  market_status: string | null;
  next_open_at: string | null;
  updated_at: string;
};

export type StackComponent = { address: string; provider: "bstock" | "ondo"; ticker: string; symbol: string; weight_bps: number };

export type StackRow = {
  id: number;
  creator_id: string | null;
  creator_address: string;
  ticker: string;
  name: string;
  description: string | null;
  image_url: string | null;
  metadata_uri: string;
  components: StackComponent[];
  launch_units: string[] | null;
  tx_hash: string;
  created_at: string;
};

export type StackIndexPointRow = { stack_id: number; ts: string; value: string; reference_value: string | null };
export type StackMetadataRow = {
  metadata_uri: string;
  profile_id: string | null;
  name: string;
  ticker: string;
  description: string | null;
  image_url: string | null;
  telegram_url?: string | null; // 0003_club_links
  created_at: string;
};

export type IntentKind = "buy_stock" | "buy_stack" | "sell_stock" | "sell_stack" | "redeem";
export type IntentStatus =
  | "created"
  | "fee_paid"
  | "legs_running"
  | "legs_done"
  | "depositing"
  | "done"
  | "partial"
  | "failed"
  | "cancelled";

export type IntentRow = {
  id: string;
  profile_id: string;
  wallet_address: string;
  kind: IntentKind;
  stack_id: number | null;
  position_id: number | null;
  asset_address: string | null;
  gross_amount: string | null;
  fee_amount: string | null;
  bps: number | null;
  fee_receipt_id: number | null;
  fee_tx_hash: string | null;
  release_tx_hash: string | null;
  released_amounts: string[] | null;
  deposit_tx_hash: string | null;
  sell_fee_tx_hash: string | null;
  status: IntentStatus;
  error: string | null;
  created_at: string;
  updated_at: string;
};

export type LegStatus = "pending" | "quoted" | "signed" | "submitted" | "filled" | "failed" | "expired" | "skipped";
export type IntentLegRow = {
  intent_id: string;
  leg_index: number;
  from_token: string;
  to_token: string;
  amount_in: string;
  expected_out: string | null;
  min_out: string | null;
  actual_out: string | null;
  mode: "SWAP" | "RFQ" | null;
  vendor: string | null;
  rfq_quote_id: string | null;
  signing_scheme: string | null;
  signature: string | null;
  attempt: number;
  balance_before: string | null;
  order_id: string | null;
  tx_hash: string | null;
  status: LegStatus;
  error: string | null;
  updated_at: string;
};

export type TradeRow = {
  id: number;
  profile_id: string | null;
  intent_id: string | null;
  side: "buy" | "sell";
  asset_address: string | null;
  stack_id: number | null;
  position_id: number | null;
  usd_amount: string;
  units: string | null;
  price_usd: string | null;
  tx_hash: string | null;
  created_at: string;
};

export type CommentRow = {
  id: string;
  profile_id: string | null;
  target_type: "asset" | "stack";
  target_id: string;
  parent_id: string | null;
  body: string;
  is_demo: boolean;
  created_at: string;
};

export type ActivityType = "buy" | "sell" | "redeem" | "create_stack" | "claim";
export type ActivityRow = {
  id: number;
  profile_id: string | null;
  type: ActivityType;
  target_type: string | null;
  target_id: string | null;
  usd_amount: string | null;
  tx_hash: string | null;
  created_at: string;
};

export type HolderRow = {
  profile_id: string;
  target_type: "asset" | "stack";
  target_id: string;
  net_usd: string;
  cost_basis_usd: string;
  net_units: string;
  avg_entry_usd: string | null;
  last_trade_at: string;
};
