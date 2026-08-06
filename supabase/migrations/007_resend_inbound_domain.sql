-- Route every workspace through the Resend-managed inbound domain.
-- Safe to run repeatedly.

update public.inbound_addresses ia
set address = w.slug || '@rinurexaun.resend.app'
from public.workspaces w
where ia.workspace_id = w.id
  and ia.address is distinct from w.slug || '@rinurexaun.resend.app';

create or replace function public.create_workspace_with_admin(workspace_name text, workspace_slug text)
returns public.workspaces language plpgsql security definer set search_path=public as $$
declare created_workspace public.workspaces;
begin
  if auth.uid() is null then raise exception 'Unauthorized'; end if;
  insert into public.workspaces(name,slug) values(workspace_name,workspace_slug) returning * into created_workspace;
  insert into public.memberships(workspace_id,user_id,role) values(created_workspace.id,auth.uid(),'admin');
  insert into public.inbound_addresses(workspace_id,address)
  values(created_workspace.id, workspace_slug || '@rinurexaun.resend.app');
  return created_workspace;
end;
$$;

grant execute on function public.create_workspace_with_admin(text,text) to authenticated;
