-- ============================================================================
-- TARSONS HSE Portal — Supabase schema
-- Run this once in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ============================================================================

-- 1. The data table -----------------------------------------------------
-- Mirrors the old "one sheet tab per LocalDB key" model: one row per key
-- (users, ptw, hira, ppe, gallery, ...), value stored as jsonb so it
-- round-trips exactly like the app's localStorage/JSON blob did.
create table if not exists public.hse_data (
  key         text primary key,
  value       jsonb not null default '[]'::jsonb,
  updated_at  timestamptz not null default now()
);

comment on table public.hse_data is 'Key/value store backing the HSE Portal LocalDB layer. One row per app data key (users, ptw, hira, gallery, etc).';

-- 2. Row Level Security ---------------------------------------------------
-- IMPORTANT SECURITY NOTE: the portal has no server-side authentication of
-- its own (usernames/passwords are just rows inside this table, checked in
-- the browser) — this mirrors exactly how the old Apps Script deployment
-- worked ("Execute as: Me, Access: Anyone"), so anyone with the anon key
-- embedded in the page can read and write all data. That was already true
-- before this migration. If you need real access control, the fix is to
-- add Supabase Auth and rewrite these policies to check auth.uid() —
-- ask me if you want help with that next.
alter table public.hse_data enable row level security;

create policy "hse_data anon read"   on public.hse_data for select using (true);
create policy "hse_data anon insert" on public.hse_data for insert with check (true);
create policy "hse_data anon update" on public.hse_data for update using (true);
create policy "hse_data anon delete" on public.hse_data for delete using (true);

-- 3. Realtime ---------------------------------------------------------------
-- Lets every open browser tab get pushed the change instantly instead of
-- polling every 15s like the old Google Sheets setup.
alter publication supabase_realtime add table public.hse_data;

-- 4. Storage bucket for photos / policy PDFs / visitor passes ---------------
-- Public bucket (read+write open, same trust model as #2 above).
insert into storage.buckets (id, name, public)
values ('hse-uploads', 'hse-uploads', true)
on conflict (id) do nothing;

create policy "hse-uploads anon read"
  on storage.objects for select
  using (bucket_id = 'hse-uploads');

create policy "hse-uploads anon insert"
  on storage.objects for insert
  with check (bucket_id = 'hse-uploads');

create policy "hse-uploads anon update"
  on storage.objects for update
  using (bucket_id = 'hse-uploads');

create policy "hse-uploads anon delete"
  on storage.objects for delete
  using (bucket_id = 'hse-uploads');
