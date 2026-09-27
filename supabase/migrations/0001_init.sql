-- StacksClub schema (docs/BACKEND.md §4). Supabase is a cache and social store; chain state is
-- the source of truth for recipes, position owners, units and fees.

create extension if not exists citext;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table profiles (
  id uuid primary key default gen_random_uuid(),
  privy_id text unique not null,
  wallet_address text unique not null,          -- lowercase
  username citext unique not null check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text check (char_length(display_name) <= 40),
  avatar_url text,
  bio text check (char_length(bio) <= 160),
  x_url text check (x_url is null or x_url ~ '^https://(x|twitter)\.com/[A-Za-z0-9_]{1,15}/?$'),
  show_values boolean not null default false,
  created_at timestamptz not null default now()
);

create table follows (
  follower_id uuid references profiles(id) on delete cascade,
  followee_id uuid references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);

create table assets (
  provider text not null check (provider in ('bstock','ondo')),
  chain_id int not null default 56,
  address text not null,                        -- checksum
  ticker text not null,                         -- underlying, e.g. NVDA
  symbol text not null,                         -- provider token symbol
  name text not null,
  logo_url text,
  decimals int not null,
  share_multiplier numeric,
  can_browse boolean not null default true,
  can_stack boolean not null default false,
  can_trade boolean not null default false,
  vault_ok boolean,                             -- set from the fork test result
  route_check text,                             -- last quote probe result, e.g. 'RFQ' or an error code
  source text not null,
  verified_at timestamptz,
  primary key (chain_id, address)
);

create table asset_prices (
  chain_id int not null default 56,
  address text not null,
  price_usd numeric,
  reference_price_usd numeric,
  change_24h numeric,                           -- percent, e.g. -0.85
  market_cap numeric,
  volume_24h numeric,
  market_open boolean,
  market_status text,
  next_open_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (chain_id, address)
);

create table stacks (
  id bigint primary key,                        -- onchain stackId
  creator_id uuid references profiles(id),
  creator_address text not null,
  ticker text unique not null,
  name text not null,
  description text,
  image_url text,
  metadata_uri text not null,
  components jsonb not null,                    -- [{address, provider, ticker, weight_bps}]
  launch_units jsonb,                           -- frozen notional units for the index
  tx_hash text not null,
  created_at timestamptz not null default now()
);

create table stack_index_points (
  stack_id bigint references stacks(id) on delete cascade,
  ts timestamptz not null,
  value numeric not null,
  reference_value numeric,
  primary key (stack_id, ts)
);

-- Pending Stack metadata uploaded before the createStack tx; linked by metadata_uri on sync.
create table stack_metadata (
  metadata_uri text primary key,
  profile_id uuid references profiles(id) on delete cascade,
  name text not null,
  ticker text not null,
  description text,
  image_url text,
  created_at timestamptz not null default now()
);

create table intents (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) not null,
  wallet_address text not null,                 -- lowercase, verified against Privy at creation
  kind text not null check (kind in ('buy_stock','buy_stack','sell_stock','sell_stack','redeem')),
  stack_id bigint,
  position_id bigint,
  asset_address text,
  gross_amount text,                            -- raw USDT units as string
  fee_amount text,
  bps int,                                      -- sell/redeem fraction
  fee_receipt_id bigint,
  fee_tx_hash text,
  release_tx_hash text,
  released_amounts jsonb,                       -- sell/redeem: raw units per component
  deposit_tx_hash text,
  sell_fee_tx_hash text,
  status text not null default 'created'
    check (status in ('created','fee_paid','legs_running','legs_done','depositing','done','partial','failed','cancelled')),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table intent_legs (
  intent_id uuid references intents(id) on delete cascade,
  leg_index int not null,
  from_token text not null,
  to_token text not null,
  amount_in text not null,
  expected_out text,
  min_out text,
  actual_out text,
  mode text check (mode in ('SWAP','RFQ')),
  vendor text,
  rfq_quote_id text,                            -- rfq.orderId from /swap, submitted as quoteId
  signing_scheme text,
  signature text,                               -- user's EIP-712 signature, kept so an interrupted submit can be retried idempotently
  attempt int not null default 0,               -- bumps on retry; part of the RFQ requestId
  balance_before text,                          -- to_token balance when the leg was quoted
  order_id text,
  tx_hash text,
  status text not null default 'pending'
    check (status in ('pending','quoted','signed','submitted','filled','failed','expired','skipped')),
  error text,
  updated_at timestamptz not null default now(),
  primary key (intent_id, leg_index)
);

create table trades (                            -- confirmed fills only
  id bigserial primary key,
  profile_id uuid references profiles(id),
  intent_id uuid references intents(id),
  side text not null check (side in ('buy','sell')),
  asset_address text,
  stack_id bigint,
  position_id bigint,
  usd_amount numeric not null,
  units text,
  price_usd numeric,
  tx_hash text,
  created_at timestamptz not null default now()
);

create table chain_events (                      -- idempotent log of vault events
  chain_id int not null default 56,
  tx_hash text not null,
  log_index int not null,
  event text not null,
  data jsonb not null,
  block_number bigint not null,
  primary key (chain_id, tx_hash, log_index)
);

create table sync_state (
  id text primary key,                          -- 'vault'
  last_block bigint not null,
  updated_at timestamptz not null default now()
);

create table watchlist (
  profile_id uuid references profiles(id) on delete cascade,
  target_type text not null check (target_type in ('asset','stack')),
  target_id text not null,
  created_at timestamptz not null default now(),
  primary key (profile_id, target_type, target_id)
);

create table comments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  target_type text not null check (target_type in ('asset','stack')),
  target_id text not null,
  parent_id uuid references comments(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 280),
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create table comment_likes (
  comment_id uuid references comments(id) on delete cascade,
  profile_id uuid references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, profile_id)
);

create table activity (
  id bigserial primary key,
  profile_id uuid references profiles(id) on delete cascade,
  type text not null check (type in ('buy','sell','redeem','create_stack','claim')),
  target_type text,
  target_id text,
  usd_amount numeric,
  tx_hash text,
  created_at timestamptz not null default now()
);

create table rate_limits (
  key text primary key,
  tokens numeric not null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index on follows (followee_id);
create index on assets (ticker);
create index on stacks (creator_id);
create index on stacks (created_at desc);
create index on stack_index_points (stack_id, ts desc);
create index on intents (profile_id, created_at desc);
create index on intents (profile_id) where status not in ('done','cancelled','failed');
create index on trades (profile_id, created_at desc);
create index on trades (asset_address);
create index on trades (stack_id);
create index on trades (created_at desc);
create index on watchlist (profile_id);
create index on comments (target_type, target_id, created_at desc);
create index on comments (parent_id);
create index on comments (profile_id);
create index on comment_likes (profile_id);
create index on activity (target_type, target_id, created_at desc);
create index on activity (profile_id, created_at desc);
create index on activity (created_at desc);
create index on chain_events (event, block_number);
create unique index activity_tx_type on activity (tx_hash, type);
create unique index trades_intent_side_target on trades (intent_id, side, asset_address, stack_id) nulls not distinct;

-- ---------------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------------

-- Profiles without privy_id, for public reads.
create view public_profiles with (security_invoker = false) as
  select id, wallet_address, username, display_name, avatar_url, bio, x_url, show_values, created_at
  from profiles;

-- Net position per profile and target from confirmed trades. For Stacks the target is the
-- Stack id; units there are per-position and live onchain, so only USD figures are aggregated.
create view holders with (security_invoker = false) as
  select
    t.profile_id,
    case when t.stack_id is not null then 'stack' else 'asset' end as target_type,
    coalesce(t.stack_id::text, t.asset_address) as target_id,
    sum(case when t.side = 'buy' then t.usd_amount else -t.usd_amount end) as net_usd,
    sum(case when t.side = 'buy' then t.usd_amount else 0 end) as cost_basis_usd,
    sum(case when t.side = 'buy' and t.stack_id is null then (t.units::numeric) else 0 end)
      - sum(case when t.side = 'sell' and t.stack_id is null then (t.units::numeric) else 0 end) as net_units,
    case
      when sum(case when t.side = 'buy' and t.price_usd is not null then t.usd_amount else 0 end) > 0
      then sum(case when t.side = 'buy' and t.price_usd is not null then t.usd_amount else 0 end)
           / nullif(sum(case when t.side = 'buy' and t.price_usd is not null then t.usd_amount / t.price_usd else 0 end), 0)
    end as avg_entry_usd,
    max(t.created_at) as last_trade_at
  from trades t
  group by t.profile_id, 2, 3;

-- Weekly Top Trades (FLOWS.md §10): per-user PnL over the last 7 days, best target per user.
create view weekly_pnl with (security_invoker = false) as
with week as (
  select t.*, coalesce(t.stack_id::text, t.asset_address) as target_id,
         case when t.stack_id is not null then 'stack' else 'asset' end as target_type
  from trades t where t.created_at > now() - interval '7 days'
),
per_target as (
  select w.profile_id, w.target_type, w.target_id,
    -- realised: sells minus the cost of what was sold is not tracked per lot here, so realised
    -- PnL is sell proceeds minus buys for fully exited targets; unrealised uses current prices
    -- for single stocks. Stack unrealised PnL is added by the API from onchain positions.
    sum(case when w.side = 'sell' then w.usd_amount else -w.usd_amount end) as cash_flow,
    sum(case when w.side = 'buy' and w.stack_id is null then w.units::numeric else 0 end)
      - sum(case when w.side = 'sell' and w.stack_id is null then w.units::numeric else 0 end) as open_units,
    max(w.asset_address) as asset_address
  from week w group by 1, 2, 3
)
select p.profile_id, p.target_type, p.target_id,
  p.cash_flow + coalesce(p.open_units * ap.price_usd / power(10, a.decimals), 0) as pnl_usd
from per_target p
left join assets a on a.address = p.asset_address
left join asset_prices ap on ap.address = p.asset_address;

-- Hall of Fame: Stacks by creator fees earned (BuyFeePaid events), all time.
create view hall_of_fame with (security_invoker = false) as
  select (e.data->>'stackId')::bigint as stack_id,
         sum((e.data->>'creatorCut')::numeric) as creator_earned_raw,
         count(*) as buys
  from chain_events e
  where e.event = 'BuyFeePaid' and (e.data->>'stackId')::bigint > 0
  group by 1;

-- ---------------------------------------------------------------------------
-- RLS: public read where the spec says so, no client writes. All writes go through API routes
-- using the secret key, which bypasses RLS. intents, intent_legs, trades and watchlist have no
-- policies, so only the API (after verifying the Privy token) can read them for their owner.
-- ---------------------------------------------------------------------------

alter table profiles enable row level security;
alter table follows enable row level security;
alter table assets enable row level security;
alter table asset_prices enable row level security;
alter table stacks enable row level security;
alter table stack_index_points enable row level security;
alter table stack_metadata enable row level security;
alter table intents enable row level security;
alter table intent_legs enable row level security;
alter table trades enable row level security;
alter table chain_events enable row level security;
alter table sync_state enable row level security;
alter table watchlist enable row level security;
alter table comments enable row level security;
alter table comment_likes enable row level security;
alter table activity enable row level security;
alter table rate_limits enable row level security;

-- profiles itself is not publicly readable (privy_id); the public_profiles view is.
create policy "public read" on follows for select using (true);
create policy "public read" on assets for select using (true);
create policy "public read" on asset_prices for select using (true);
create policy "public read" on stacks for select using (true);
create policy "public read" on stack_index_points for select using (true);
create policy "public read" on comments for select using (true);
create policy "public read" on comment_likes for select using (true);
create policy "public read" on activity for select using (true);

grant select on public_profiles to anon, authenticated;
revoke select on holders, weekly_pnl, hall_of_fame from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table activity;
alter publication supabase_realtime add table asset_prices;

-- ---------------------------------------------------------------------------
-- Storage: avatars and stacks, public read, 2MB, images only, writes via API routes
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 2097152, array['image/png','image/jpeg','image/webp','image/gif']),
  ('stacks', 'stacks', true, 2097152, array['image/png','image/jpeg','image/webp','image/gif']),
  ('stack-metadata', 'stack-metadata', true, 16384, array['application/json'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Rate limit helper: token bucket, `capacity` tokens refilled over `per_seconds`.
-- ---------------------------------------------------------------------------

create or replace function take_token(p_key text, capacity numeric, per_seconds numeric)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  cur numeric;
  last timestamptz;
begin
  insert into rate_limits (key, tokens, updated_at) values (p_key, capacity, now())
  on conflict (key) do nothing;
  select tokens, updated_at into cur, last from rate_limits where key = p_key for update;
  cur := least(capacity, cur + extract(epoch from (now() - last)) * capacity / per_seconds);
  if cur < 1 then
    update rate_limits set tokens = cur, updated_at = now() where key = p_key;
    return false;
  end if;
  update rate_limits set tokens = cur - 1, updated_at = now() where key = p_key;
  return true;
end $$;
revoke execute on function take_token from anon, authenticated;
