-- The texting assistant, part two: Telegram as a second channel, and buys made by text for users
-- who turn that on. All four tables are server-only: RLS on, no policies. Additive only.

-- A Telegram account connected to a profile. One per profile, one profile per account.
create table telegram_links (
  profile_id uuid primary key references profiles(id) on delete cascade,
  privy_id text not null,
  wallet_address text not null,                  -- lowercase, the acting wallet when the link was made, verified against Privy
  telegram_id text unique not null check (telegram_id ~ '^[0-9]{1,20}$'),
  linked_at timestamptz not null default now()
);

-- Pending Telegram connection. The code travels in the t.me deep link, so it is long and random
-- rather than typed. Valid for 10 minutes, one per profile.
create table telegram_link_codes (
  code text primary key check (code ~ '^[A-Za-z0-9_-]{16,64}$'),
  profile_id uuid unique not null references profiles(id) on delete cascade,
  privy_id text not null,
  wallet_address text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- Text buys are off until the user turns them on, and capped. Per profile, so the same limits
-- apply on iMessage and Telegram.
create table assistant_settings (
  profile_id uuid primary key references profiles(id) on delete cascade,
  trade_enabled boolean not null default false,
  trade_cap_usd numeric not null default 50 check (trade_cap_usd >= 1 and trade_cap_usd <= 10000),
  trade_daily_usd numeric not null default 200 check (trade_daily_usd >= 1 and trade_daily_usd <= 50000),
  updated_at timestamptz not null default now()
);

-- One row per buy asked for by text: `pending` until the user replies yes; only then is an intent
-- created and run. Used for the confirmation step, the daily cap and the audit trail.
create table bot_orders (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  channel text not null check (channel in ('imessage', 'telegram', 'terminal')),
  kind text not null check (kind in ('buy_stock', 'buy_stack')),
  asset_address text,
  stack_id bigint,
  label text not null,                           -- what the user was shown, e.g. "NVDA"
  usd numeric not null check (usd > 0),
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed')),
  intent_id uuid references intents(id) on delete set null,
  error text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index on bot_orders (profile_id, created_at desc);
create index on telegram_link_codes (expires_at);

alter table telegram_links enable row level security;
alter table telegram_link_codes enable row level security;
alter table assistant_settings enable row level security;
alter table bot_orders enable row level security;
