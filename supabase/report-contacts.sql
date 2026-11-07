-- Run the entire file once in Supabase > SQL Editor.
-- Contacts live separately from public reports; existing reports remain unchanged.
begin;

create or replace function public.is_verified_pcu_user()
returns boolean language sql stable security definer set search_path = ''
as $$
    select exists (
        select 1 from auth.users u
        where u.id = (select auth.uid()) and u.email_confirmed_at is not null
          and lower(u.email) ~ '^[^[:space:]@]+@pcu[.]edu[.]ph$'
    );
$$;
revoke all on function public.is_verified_pcu_user() from public, anon, authenticated;
grant execute on function public.is_verified_pcu_user() to authenticated;

create table if not exists public.report_contacts (
    item_id bigint primary key references public.items(id) on delete cascade,
    method text not null check (method in ('email', 'messenger', 'phone')),
    value text not null,
    consent boolean not null check (consent = true),
    created_at timestamptz not null default now(),
    constraint report_contact_value_valid check (
        value = btrim(value) and (
            (method = 'email' and length(value) <= 254
                and value ~* '^[a-z0-9._+-]+@pcu[.]edu[.]ph$')
            or (method = 'phone' and value ~ '^(09[0-9]{9}|[+]639[0-9]{9})$')
            or (method = 'messenger' and length(value) <= 300
                and value ~* '^https://(m[.]me/[a-z0-9.]+/?|(www[.])?messenger[.]com/t/[a-z0-9.]+/?|(www[.])?facebook[.]com/(profile[.]php[?]id=[0-9]+|[a-z0-9.]+/?))$')
        )
    )
);
alter table public.report_contacts enable row level security;
revoke all on public.report_contacts from public, anon, authenticated;
grant select, insert, delete on public.report_contacts to authenticated;

drop policy if exists "PCU members read shared report contacts" on public.report_contacts;
create policy "PCU members read shared report contacts" on public.report_contacts
for select to authenticated using (
    (select public.is_verified_pcu_user()) and exists (
        select 1 from public.items i where i.id = item_id
        and (i.status = 'approved' or i.user_id = (select auth.uid()))
    )
);
drop policy if exists "Owners add their report contacts" on public.report_contacts;
create policy "Owners add their report contacts" on public.report_contacts
for insert to authenticated with check (
    consent and (select public.is_verified_pcu_user()) and exists (
        select 1 from public.items i where i.id = item_id
        and i.user_id = (select auth.uid()) and i.status = 'pending'
    )
);
drop policy if exists "Owners remove their report contacts" on public.report_contacts;
create policy "Owners remove their report contacts" on public.report_contacts
for delete to authenticated using (
    (select public.is_verified_pcu_user()) and exists (
        select 1 from public.items i where i.id = item_id and i.user_id = (select auth.uid())
    )
);

-- Invoker permissions preserve the existing items RLS rules.
create or replace function public.submit_report_with_contact(
    p_report jsonb, p_method text, p_value text, p_consent boolean
) returns bigint language plpgsql security invoker set search_path = ''
as $$
declare new_item_id bigint;
begin
    if not public.is_verified_pcu_user() then
        raise exception 'A confirmed PCU account is required to share contact details.' using errcode = '42501';
    end if;
    if p_consent is distinct from true then
        raise exception 'Choose whether to share your contact details.' using errcode = '22023';
    end if;
    insert into public.items (user_id, category_id, title, description, item_type, location, event_date, status, image_url)
    values (
        auth.uid(), (p_report->>'category_id')::bigint,
        btrim(p_report->>'title'), btrim(p_report->>'description'), p_report->>'item_type',
        btrim(p_report->>'location'), (p_report->>'event_date')::date, 'pending', p_report->>'image_url'
    ) returning id into new_item_id;
    insert into public.report_contacts (item_id, method, value, consent)
    values (new_item_id, p_method, btrim(p_value), true);
    return new_item_id;
end;
$$;
revoke all on function public.submit_report_with_contact(jsonb, text, text, boolean) from public, anon, authenticated;
grant execute on function public.submit_report_with_contact(jsonb, text, text, boolean) to authenticated;
notify pgrst, 'reload schema';
commit;
