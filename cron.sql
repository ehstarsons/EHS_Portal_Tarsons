-- ============================================================================
-- Daily overdue-alert email — run AFTER schema.sql and AFTER you've deployed
-- the send-email Edge Function (see supabase/functions/send-email).
--
-- Replaces the old Apps Script time-driven trigger on sendOverdueAlertEmail.
-- The actual "is anything due/overdue" logic now lives inside the Edge
-- Function (action: 'overdueAlertCheck'), which reads hse_data directly
-- with the service role key and only emails if something is due.
-- ============================================================================

-- Enable the extensions needed to run scheduled HTTP calls from Postgres.
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Remove any previous schedule with the same name so re-running this is safe.
select cron.unschedule('hse-overdue-alert-daily')
where exists (select 1 from cron.job where jobname = 'hse-overdue-alert-daily');

-- Fires once a day at 08:00 UTC — change the cron expression to suit your
-- timezone (Asia/Kolkata is UTC+5:30, so 08:00 UTC = 1:30 PM IST; for an
-- 8 AM IST alert instead, use '30 2 * * *').
select cron.schedule(
  'hse-overdue-alert-daily',
  '0 8 * * *',
  $$
  select net.http_post(
    url := 'https://iolbegisxrlidgfcynis.supabase.co/functions/v1/send-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer sb_publishable_lUVh90g95lJ3mb5UVqE6KQ_209lOOB3'
    ),
    body := jsonb_build_object('action', 'overdueAlertCheck')
  );
  $$
);

-- To check it's registered:
--   select * from cron.job;
-- To see run history:
--   select * from cron.job_run_details order by start_time desc limit 20;
