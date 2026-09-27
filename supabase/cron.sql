-- Schedules the app's cron routes from Supabase (pg_cron + pg_net), for Vercel Hobby, which only
-- allows daily Vercel Cron jobs. Run once in the Supabase SQL editor after the first deploy.
-- Replace the two placeholders. The secret is stored in Supabase Vault, not in the job text.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select vault.create_secret('<CRON_SECRET>', 'stacksclub_cron_secret');
select vault.create_secret('https://0x-stacks-club.vercel.app', 'stacksclub_app_url');

create or replace function stacksclub_call(path text) returns void language sql security definer as $$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'stacksclub_app_url') || path,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'stacksclub_cron_secret')
    ),
    timeout_milliseconds := 55000
  );
$$;

select cron.schedule('stacksclub-prices', '* * * * *', $$select stacksclub_call('/api/cron/prices')$$);
select cron.schedule('stacksclub-sync', '* * * * *', $$select stacksclub_call('/api/cron/sync')$$);
select cron.schedule('stacksclub-index', '*/5 * * * *', $$select stacksclub_call('/api/cron/index')$$);
select cron.schedule('stacksclub-logos', '17 3 * * *', $$select stacksclub_call('/api/cron/mirror-logos')$$);
