-- RelayDesk support operations: read receipts, snoozing, canned replies,
-- contact activity, SLA tracking, persisted summaries and webhook delivery.

alter table public.conversations
  add column if not exists snoozed_until timestamptz,
  add column if not exists first_response_at timestamptz,
  add column if not exists resolved_at timestamptz,
  add column if not exists sla_due_at timestamptz,
  add column if not exists priority text not null default 'normal';

do $$ begin
  alter table public.conversations
    add constraint conversations_priority_check
    check (priority in ('low','normal','high','urgent'));
exception when duplicate_object then null; end $$;

alter table public.messages
  add column if not exists delivered_at timestamptz,
  add column if not exists visitor_read_at timestamptz,
  add column if not exists agent_read_at timestamptz;

create table if not exists public.canned_responses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  body text not null check (char_length(body) between 1 and 5000),
  tags text[] not null default '{}',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.contact_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  event_type text not null check (event_type in ('page_view','conversation_started','message_sent','email_received','email_sent','status_changed','assigned','note')),
  title text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists contact_events_contact_created_idx on public.contact_events(contact_id, created_at desc);

create table if not exists public.workspace_sla_policies (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  first_response_minutes integer not null default 60 check (first_response_minutes between 1 and 10080),
  resolution_minutes integer not null default 1440 check (resolution_minutes between 1 and 43200),
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.outbound_webhooks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  url text not null check (url ~ '^https://'),
  secret text not null,
  events text[] not null default array['conversation.created','message.created'],
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  webhook_id uuid not null references public.outbound_webhooks(id) on delete cascade,
  event text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','delivered','failed')),
  response_status integer,
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);
create index if not exists webhook_deliveries_pending_idx on public.webhook_deliveries(status, created_at);

alter table public.canned_responses enable row level security;
alter table public.contact_events enable row level security;
alter table public.workspace_sla_policies enable row level security;
alter table public.outbound_webhooks enable row level security;
alter table public.webhook_deliveries enable row level security;

create policy "members manage canned responses" on public.canned_responses
for all to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

create policy "members read contact events" on public.contact_events
for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy "members insert contact events" on public.contact_events
for insert to authenticated
with check (public.is_workspace_member(workspace_id));

create policy "members read sla policies" on public.workspace_sla_policies
for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy "admins manage sla policies" on public.workspace_sla_policies
for all to authenticated
using (public.is_workspace_admin(workspace_id))
with check (public.is_workspace_admin(workspace_id));

create policy "admins manage outbound webhooks" on public.outbound_webhooks
for all to authenticated
using (public.is_workspace_admin(workspace_id))
with check (public.is_workspace_admin(workspace_id));

create policy "admins read webhook deliveries" on public.webhook_deliveries
for select to authenticated
using (exists (
  select 1 from public.outbound_webhooks w
  where w.id = webhook_id and public.is_workspace_admin(w.workspace_id)
));

create or replace function public.apply_conversation_lifecycle()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.status = 'snoozed' and new.snoozed_until is null then
    new.snoozed_until := now() + interval '1 hour';
  elsif new.status <> 'snoozed' then
    new.snoozed_until := null;
  end if;

  if new.status = 'resolved' and old.status is distinct from 'resolved' then
    new.resolved_at := now();
  elsif new.status <> 'resolved' then
    new.resolved_at := null;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists conversations_lifecycle_trigger on public.conversations;
create trigger conversations_lifecycle_trigger
before update on public.conversations
for each row execute function public.apply_conversation_lifecycle();

create or replace function public.set_initial_conversation_sla()
returns trigger language plpgsql set search_path=public as $$
declare response_minutes integer;
begin
  select first_response_minutes into response_minutes
  from public.workspace_sla_policies
  where workspace_id = new.workspace_id and enabled = true;

  new.sla_due_at := new.created_at + make_interval(mins => coalesce(response_minutes, 60));
  return new;
end;
$$;

drop trigger if exists conversations_initial_sla_trigger on public.conversations;
create trigger conversations_initial_sla_trigger
before insert on public.conversations
for each row execute function public.set_initial_conversation_sla();

create or replace function public.record_agent_first_response()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.sender_type = 'agent' then
    update public.conversations
    set first_response_at = coalesce(first_response_at, new.created_at),
        updated_at = now()
    where id = new.conversation_id;
  end if;
  return new;
end;
$$;

drop trigger if exists messages_first_response_trigger on public.messages;
create trigger messages_first_response_trigger
after insert on public.messages
for each row execute function public.record_agent_first_response();

create or replace function public.record_message_contact_event()
returns trigger language plpgsql set search_path=public as $$
declare target_contact uuid;
begin
  select contact_id into target_contact from public.conversations where id = new.conversation_id;
  if target_contact is not null then
    insert into public.contact_events(workspace_id, contact_id, conversation_id, event_type, title, metadata)
    values (
      new.workspace_id,
      target_contact,
      new.conversation_id,
      case when new.channel = 'email' and new.sender_type = 'contact' then 'email_received'
           when new.channel = 'email' and new.sender_type = 'agent' then 'email_sent'
           else 'message_sent' end,
      case when new.sender_type = 'contact' then 'Customer sent a message' else 'Agent sent a reply' end,
      jsonb_build_object('message_id', new.id, 'channel', new.channel, 'sender_type', new.sender_type)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists messages_contact_event_trigger on public.messages;
create trigger messages_contact_event_trigger
after insert on public.messages
for each row execute function public.record_message_contact_event();

insert into public.workspace_sla_policies(workspace_id)
select id from public.workspaces
on conflict (workspace_id) do nothing;
