-- Clubs: one room per Stack, run by its creator. Members are wallets holding an open position in
-- the Stack (checked onchain by the API on every write). Everyone sees the Club page, member list,
-- announcements and pinned posts; only members read and write the chat. All reads and writes go
-- through API routes, so there are no public RLS policies on club_posts.

create table club_posts (
  id uuid primary key default gen_random_uuid(),
  stack_id bigint not null references stacks(id) on delete cascade,
  profile_id uuid references profiles(id) on delete cascade,
  kind text not null default 'message' check (kind in ('message', 'announcement')),
  body text not null check (char_length(body) between 1 and 500),
  pinned boolean not null default false,
  removed boolean not null default false,
  removed_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create index on club_posts (stack_id, created_at desc);
create index on club_posts (stack_id) where pinned and not removed;
create index on club_posts (profile_id);

alter table club_posts enable row level security;
