-- Queue AI summary refreshes whenever a conversation receives new messages.

create table if not exists public.conversation_summary_jobs (
  conversation_id uuid primary key references public.conversations(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  requested_message_count integer not null default 0,
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists conversation_summary_jobs_available_idx
  on public.conversation_summary_jobs(available_at, updated_at);

alter table public.conversation_summary_jobs enable row level security;
create policy "admins read summary jobs" on public.conversation_summary_jobs
for select to authenticated
using (public.is_workspace_admin(workspace_id));

create or replace function public.queue_conversation_summary_refresh()
returns trigger language plpgsql security definer set search_path=public as $$
declare current_count integer;
begin
  select count(*) into current_count from public.messages where conversation_id = new.conversation_id;
  insert into public.conversation_summary_jobs(
    conversation_id, workspace_id, requested_message_count, attempts, available_at, locked_at, last_error, updated_at
  ) values (
    new.conversation_id, new.workspace_id, current_count, 0, now() + interval '20 seconds', null, null, now()
  )
  on conflict (conversation_id) do update set
    workspace_id = excluded.workspace_id,
    requested_message_count = excluded.requested_message_count,
    attempts = 0,
    available_at = now() + interval '20 seconds',
    locked_at = null,
    last_error = null,
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists messages_queue_summary_refresh_trigger on public.messages;
create trigger messages_queue_summary_refresh_trigger
after insert on public.messages
for each row execute function public.queue_conversation_summary_refresh();

-- Seed jobs only where an existing summary is behind the current transcript.
insert into public.conversation_summary_jobs(conversation_id, workspace_id, requested_message_count)
select c.id, c.workspace_id, count(m.id)::integer
from public.conversations c
join public.messages m on m.conversation_id = c.id
left join public.conversation_summaries s on s.conversation_id = c.id
group by c.id, c.workspace_id, s.source_message_count
having count(m.id) > coalesce(s.source_message_count, 0)
on conflict (conversation_id) do update set
  requested_message_count = excluded.requested_message_count,
  available_at = now(),
  updated_at = now();
