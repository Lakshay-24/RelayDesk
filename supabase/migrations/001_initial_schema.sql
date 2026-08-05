create extension if not exists pgcrypto;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,50}$'),
  public_key uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','agent')),
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text,
  email text,
  visitor_key uuid,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists contacts_workspace_email_uidx on public.contacts(workspace_id, lower(email)) where email is not null;
create unique index if not exists contacts_workspace_visitor_uidx on public.contacts(workspace_id, visitor_key) where visitor_key is not null;

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  channel text not null check (channel in ('chat','email')),
  subject text,
  status text not null default 'open' check (status in ('open','snoozed','resolved')),
  assignee_id uuid references public.memberships(id) on delete set null,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists conversations_workspace_last_idx on public.conversations(workspace_id, last_message_at desc);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_type text not null check (sender_type in ('contact','agent','system')),
  sender_membership_id uuid references public.memberships(id) on delete set null,
  channel text not null check (channel in ('chat','email')),
  body text not null check (char_length(body) between 1 and 10000),
  external_message_id text,
  in_reply_to text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists messages_external_id_uidx on public.messages(external_message_id) where external_message_id is not null;
create index if not exists messages_conversation_created_idx on public.messages(conversation_id, created_at);

create table if not exists public.conversation_summaries (
  conversation_id uuid primary key references public.conversations(id) on delete cascade,
  summary text not null,
  source_message_count integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin','agent')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  invited_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.inbound_addresses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  address text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.kb_categories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  slug text not null,
  created_at timestamptz not null default now(),
  unique (workspace_id, slug)
);

create table if not exists public.kb_articles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  category_id uuid references public.kb_categories(id) on delete set null,
  title text not null,
  slug text not null,
  excerpt text,
  body_html text not null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, slug)
);

create table if not exists public.custom_domains (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  hostname text not null unique,
  verification_token text not null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.is_workspace_member(target_workspace uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.memberships m where m.workspace_id=target_workspace and m.user_id=auth.uid());
$$;

create or replace function public.is_workspace_admin(target_workspace uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.memberships m where m.workspace_id=target_workspace and m.user_id=auth.uid() and m.role='admin');
$$;

create or replace function public.create_workspace_with_admin(workspace_name text, workspace_slug text)
returns public.workspaces language plpgsql security definer set search_path=public as $$
declare created_workspace public.workspaces;
begin
  if auth.uid() is null then raise exception 'Unauthorized'; end if;
  insert into public.workspaces(name,slug) values(workspace_name,workspace_slug) returning * into created_workspace;
  insert into public.memberships(workspace_id,user_id,role) values(created_workspace.id,auth.uid(),'admin');
  insert into public.inbound_addresses(workspace_id,address) values(created_workspace.id, workspace_slug || '@inbound.relaydesk.app');
  return created_workspace;
end;
$$;
grant execute on function public.create_workspace_with_admin(text,text) to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.conversations;
exception when duplicate_object then null; end $$;

alter table public.workspaces enable row level security;
alter table public.memberships enable row level security;
alter table public.contacts enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.conversation_summaries enable row level security;
alter table public.invitations enable row level security;
alter table public.inbound_addresses enable row level security;
alter table public.kb_categories enable row level security;
alter table public.kb_articles enable row level security;
alter table public.custom_domains enable row level security;

create policy "members read workspaces" on public.workspaces for select to authenticated using (public.is_workspace_member(id));
create policy "admins update workspaces" on public.workspaces for update to authenticated using (public.is_workspace_admin(id));

create policy "members read memberships" on public.memberships for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "admins manage memberships" on public.memberships for all to authenticated using (public.is_workspace_admin(workspace_id)) with check (public.is_workspace_admin(workspace_id));

create policy "members manage contacts" on public.contacts for all to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "members manage conversations" on public.conversations for all to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "members manage messages" on public.messages for all to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "members manage summaries" on public.conversation_summaries for all to authenticated using (exists(select 1 from public.conversations c where c.id=conversation_id and public.is_workspace_member(c.workspace_id))) with check (exists(select 1 from public.conversations c where c.id=conversation_id and public.is_workspace_member(c.workspace_id)));
create policy "admins manage invitations" on public.invitations for all to authenticated using (public.is_workspace_admin(workspace_id)) with check (public.is_workspace_admin(workspace_id));
create policy "members read inbound addresses" on public.inbound_addresses for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "members manage categories" on public.kb_categories for all to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "members manage articles" on public.kb_articles for all to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "public read published articles" on public.kb_articles for select to anon using (published_at is not null);
create policy "admins manage custom domains" on public.custom_domains for all to authenticated using (public.is_workspace_admin(workspace_id)) with check (public.is_workspace_admin(workspace_id));
