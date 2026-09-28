-- Telegram club links. Each basket (a row in `stacks`) can have one Telegram group link, set by its
-- creator. The link is only revealed to wallets holding the basket (checked onchain by the API), so
-- it lives in its own table with RLS on and no policies: `stacks` is publicly readable and would leak
-- it. Additive only: no existing rows or columns change.

-- Link typed on the create form, before the createStack tx. Copied to club_links on sync.
alter table stack_metadata add column telegram_url text;

create table club_links (
  stack_id bigint primary key references stacks(id) on delete cascade,
  telegram_url text not null,
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now()
);

-- "Report link" from holders. One report per wallet per link; the link is stored so a report still
-- makes sense after the creator changes it.
create table club_link_reports (
  id bigserial primary key,
  stack_id bigint not null references stacks(id) on delete cascade,
  telegram_url text not null,
  reporter_wallet text not null,                 -- lowercase, verified against Privy
  reporter_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (stack_id, reporter_wallet, telegram_url)
);

create index on club_link_reports (stack_id, created_at desc);

alter table club_links enable row level security;
alter table club_link_reports enable row level security;
