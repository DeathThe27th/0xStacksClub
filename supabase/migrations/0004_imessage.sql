-- iMessage texting. A user connects one phone to their account by texting a 6-digit code from it
-- (inbound-first: they text us, we never text them first). Both tables are server-only: RLS is on
-- with no policies, so only API routes using the secret key can read or write them. Additive only.

-- A verified phone. One phone per profile and one profile per phone.
create table phone_links (
  profile_id uuid primary key references profiles(id) on delete cascade,
  privy_id text not null,
  wallet_address text not null,                  -- lowercase, the acting wallet when the code was made, verified against Privy
  phone text unique not null check (phone ~ '^\+[1-9][0-9]{6,14}$'),
  photon_user_id text not null,                  -- Photon "user" that allowlists this phone on the shared pool
  assigned_number text not null,                 -- the pool number Photon routes this phone through
  linked_at timestamptz not null default now()
);

-- A pending connection: valid for 10 minutes, one per profile. The phone is what the user typed on
-- the site; it only becomes a phone_links row once "link <code>" arrives from that same phone.
create table phone_link_codes (
  code text primary key check (code ~ '^[0-9]{6}$'),
  profile_id uuid unique not null references profiles(id) on delete cascade,
  privy_id text not null,
  wallet_address text not null,
  phone text not null check (phone ~ '^\+[1-9][0-9]{6,14}$'),
  photon_user_id text not null,
  assigned_number text not null,
  attempts int not null default 0,               -- wrong-phone tries against this code
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index on phone_link_codes (expires_at);

alter table phone_links enable row level security;
alter table phone_link_codes enable row level security;
