-- Audy Expansion on Supabase: replaces the claude.ai artifact database.
-- Roles: owner > editor > contributor > viewer
--   viewer       : read everything
--   contributor  : + add / edit / delete candidate locations (collection "kandidat")
--   editor/owner : + approve / reject ("keputusan") and edit malls ("mall")
--   owner        : + change people's roles
-- The first person who signs in becomes owner; everyone after that starts as viewer.

create table if not exists public.audy_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  role text not null default 'viewer' check (role in ('owner', 'editor', 'contributor', 'viewer')),
  created_at timestamptz not null default now()
);

create table if not exists public.audy_docs (
  collection text not null,
  id text not null,
  data jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (collection, id)
);

create or replace function public.audy_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.audy_members where user_id = auth.uid()
$$;

-- Called by the app after sign-in: registers the user and returns their role.
create or replace function public.audy_join() returns text
language plpgsql security definer set search_path = public, auth as $$
declare r text; em text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select role into r from public.audy_members where user_id = auth.uid();
  if r is not null then return r; end if;
  select email into em from auth.users where id = auth.uid();
  perform pg_advisory_xact_lock(42);
  if not exists (select 1 from public.audy_members) then r := 'owner'; else r := 'viewer'; end if;
  insert into public.audy_members (user_id, email, role) values (auth.uid(), coalesce(em, ''), r);
  return r;
end $$;

create or replace function public.audy_people() returns table (user_id uuid, email text, role text)
language sql stable security definer set search_path = public as $$
  select m.user_id, m.email, m.role from public.audy_members m where public.audy_role() is not null order by m.created_at
$$;

create or replace function public.audy_set_role(target_email text, new_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.audy_role() is distinct from 'owner' then raise exception 'only the owner can change roles'; end if;
  if new_role not in ('owner', 'editor', 'contributor', 'viewer') then raise exception 'unknown role %', new_role; end if;
  update public.audy_members set role = new_role where lower(email) = lower(target_email);
end $$;

grant execute on function public.audy_join() to authenticated;
grant execute on function public.audy_people() to authenticated;
grant execute on function public.audy_set_role(text, text) to authenticated;

alter table public.audy_members enable row level security;
alter table public.audy_docs enable row level security;

drop policy if exists members_read on public.audy_members;
create policy members_read on public.audy_members for select using (public.audy_role() is not null);

drop policy if exists docs_read on public.audy_docs;
create policy docs_read on public.audy_docs for select using (public.audy_role() is not null);

drop policy if exists docs_write on public.audy_docs;
create policy docs_write on public.audy_docs for all
  using (case when collection = 'kandidat' then public.audy_role() in ('owner', 'editor', 'contributor') else public.audy_role() in ('owner', 'editor') end)
  with check (case when collection = 'kandidat' then public.audy_role() in ('owner', 'editor', 'contributor') else public.audy_role() in ('owner', 'editor') end);

-- live updates for teammates (falls back to 30-second refresh if realtime is off)
do $$ begin
  alter publication supabase_realtime add table public.audy_docs;
exception when others then null; end $$;
