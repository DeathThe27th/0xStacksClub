-- Gas starter: a one-time gift of a little BNB so a wallet funded only with USDT (a card deposit,
-- or a crypto deposit without BNB) can pay its first network fees. One per profile and one per
-- wallet, ever. A row is written before the BNB is sent (status `sending`), so two requests can't
-- both pay out; it becomes `sent` with the tx hash, or is deleted if the send fails.
create table gas_starters (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references profiles(id) on delete cascade,
  wallet text not null unique,
  amount_wei numeric not null check (amount_wei > 0),
  status text not null default 'sending' check (status in ('sending', 'sent')),
  tx_hash text,
  created_at timestamptz not null default now()
);

create index on gas_starters (created_at desc);

alter table gas_starters enable row level security;
