create table if not exists public.inbound_email_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  source text not null check (source in ('webhook','sync')),
  stage text not null,
  status text not null check (status in ('info','success','error')),
  external_id text,
  detail text,
  created_at timestamptz not null default now()
);
create index if not exists inbound_email_events_workspace_created_idx on public.inbound_email_events(workspace_id,created_at desc);
alter table public.inbound_email_events enable row level security;
create policy "workspace members read inbound events" on public.inbound_email_events for select using (exists(select 1 from public.memberships m where m.workspace_id=inbound_email_events.workspace_id and m.user_id=auth.uid()));
