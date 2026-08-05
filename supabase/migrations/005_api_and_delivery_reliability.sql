-- RelayDesk public API credentials and reliable webhook delivery.

create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  key_prefix text not null,
  key_hash text not null unique,
  scopes text[] not null default array['conversations:read'],
  created_by uuid references auth.users(id) on delete set null,
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists api_keys_workspace_created_idx on public.api_keys(workspace_id, created_at desc);
create index if not exists api_keys_prefix_idx on public.api_keys(key_prefix);

alter table public.api_keys enable row level security;
create policy "admins manage api keys" on public.api_keys
for all to authenticated
using (public.is_workspace_admin(workspace_id))
with check (public.is_workspace_admin(workspace_id));

alter table public.webhook_deliveries
  add column if not exists next_attempt_at timestamptz,
  add column if not exists response_body text,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists webhook_deliveries_retry_idx
on public.webhook_deliveries(status, next_attempt_at)
where status = 'failed';

alter table public.workspace_sla_policies
  add column if not exists warning_minutes integer not null default 15
  check (warning_minutes between 1 and 1440);

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path=public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists webhook_deliveries_touch_trigger on public.webhook_deliveries;
create trigger webhook_deliveries_touch_trigger
before update on public.webhook_deliveries
for each row execute function public.touch_updated_at();
