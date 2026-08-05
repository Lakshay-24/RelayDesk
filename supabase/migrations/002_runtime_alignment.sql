-- Align the deployed schema with the current application queries.

alter table public.custom_domains
  add column if not exists status text not null default 'pending'
  check (status in ('pending','verified'));

update public.custom_domains
set status = case when verified_at is null then 'pending' else 'verified' end;

alter table public.kb_categories
  add column if not exists position integer not null default 0;

create index if not exists kb_categories_workspace_position_idx
  on public.kb_categories(workspace_id, position, created_at);

create or replace function public.accept_workspace_invitation(invite_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invite public.invitations;
  current_email text;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  select lower(email) into current_email
  from auth.users
  where id = auth.uid();

  select * into invite
  from public.invitations
  where token_hash = invite_token_hash
    and accepted_at is null
    and expires_at > now()
  for update;

  if invite.id is null then
    raise exception 'Invitation is invalid or expired';
  end if;

  if current_email is null or lower(invite.email) <> current_email then
    raise exception 'Sign in with the invited email address';
  end if;

  insert into public.memberships(workspace_id, user_id, role)
  values(invite.workspace_id, auth.uid(), invite.role)
  on conflict (workspace_id, user_id)
  do update set role = excluded.role;

  update public.invitations
  set accepted_at = now()
  where id = invite.id;

  return invite.workspace_id;
end;
$$;

grant execute on function public.accept_workspace_invitation(text) to authenticated;
