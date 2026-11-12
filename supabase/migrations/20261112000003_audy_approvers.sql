-- Approval in 3 steps: Usulan (yellow) -> Ruko ada (green) -> Disetujui (purple); Ditolak (grey).
--   * "Ruko ada" is stored on the candidate itself (kandidat.data.ruko), so contributors/editors/owner can set it.
--   * Only the owner and the approvers listed in document pengaturan/approver may write decisions (keputusan).
--     pengaturan/approver = {"ids": [user uuid, ...], "emails": ["name@company.com", ...]}
--   * Only the owner can change the approver list.
-- This replaces the rule from the first migration where every editor could approve.

create or replace function public.audy_is_approver() returns boolean
language sql stable security definer set search_path = public, auth as $$
  select public.audy_role() = 'owner'
    or exists (
      select 1 from public.audy_docs d
      where d.collection = 'pengaturan' and d.id = 'approver'
        and (
          coalesce(d.data->'ids', '[]'::jsonb) ? auth.uid()::text
          or exists (
            select 1 from jsonb_array_elements_text(coalesce(d.data->'emails', '[]'::jsonb)) e
            where lower(e) = lower((select email from auth.users where id = auth.uid()))
          )
        )
    )
$$;
grant execute on function public.audy_is_approver() to authenticated;

drop policy if exists docs_write on public.audy_docs;
create policy docs_write on public.audy_docs for all
  using (
    public.audy_role() is not null and case
      when collection = 'kandidat'   then public.audy_role() in ('owner', 'editor', 'contributor')
      when collection = 'keputusan'  then public.audy_is_approver()
      when collection = 'pengaturan' then public.audy_role() = 'owner'
      else public.audy_role() in ('owner', 'editor')
    end)
  with check (
    public.audy_role() is not null and case
      when collection = 'kandidat'   then public.audy_role() in ('owner', 'editor', 'contributor')
      when collection = 'keputusan'  then public.audy_is_approver()
      when collection = 'pengaturan' then public.audy_role() = 'owner'
      else public.audy_role() in ('owner', 'editor')
    end);

-- empty approver list to start with (until the owner adds people, only the owner can approve)
insert into public.audy_docs (collection, id, data)
values ('pengaturan', 'approver', '{"ids": [], "emails": []}'::jsonb)
on conflict (collection, id) do nothing;
