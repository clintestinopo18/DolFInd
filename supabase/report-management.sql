-- Run once in Supabase SQL Editor after report-contacts.sql and report-photos.sql.
-- Adds owner-only editing and closing; it does not replace existing RLS policies.
-- Fixed search_path and explicit privileges follow:
-- https://supabase.com/docs/guides/database/functions
begin;

create or replace function public.manage_own_report(
    p_id bigint, p_action text, p_expected text default null,
    p_report jsonb default null, p_contact jsonb default null
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
    actor uuid := auth.uid();
    item public.items%rowtype;
    contact public.report_contacts%rowtype;
    saved_contact jsonb;
    version text;
    photo text;
    report_date date;
begin
    if actor is null or not public.is_verified_pcu_user() then
        raise exception 'Log in with a confirmed PCU account.' using errcode = '42501';
    end if;
    if p_action is null or p_action not in ('get', 'edit', 'return') then
        raise exception 'Unknown report action.' using errcode = '22023';
    end if;
    -- Never trust a client-supplied owner, including when the caller is an admin.
    -- Lock before checking the snapshot so concurrent actions cannot overwrite it.
    select * into item from public.items where id = p_id and user_id = actor for update;
    if not found then
        raise exception 'This report is unavailable or does not belong to you.' using errcode = '42501';
    end if;
    select * into contact from public.report_contacts where item_id = item.id for update;
    saved_contact := case when found then to_jsonb(contact) else 'null'::jsonb end;
    version := md5(to_jsonb(item)::text || saved_contact::text);
    if p_action = 'get' then
        return jsonb_build_object('report', to_jsonb(item), 'contact', saved_contact, 'version', version);
    end if;
    if p_expected is distinct from version then
        raise exception 'This report changed. Reload it before saving.' using errcode = '40001';
    end if;
    if p_action = 'return' then
        if item.status <> 'approved' then
            raise exception 'Only an approved open report can be marked returned.' using errcode = '22023';
        end if;
        update public.items set status = 'claimed' where id = item.id and user_id = actor;
        return jsonb_build_object('id', item.id, 'status', 'claimed');
    end if;
    if item.status not in ('pending', 'approved', 'rejected') then
        raise exception 'Returned reports cannot be edited.' using errcode = '22023';
    end if;
    if jsonb_typeof(p_report) is distinct from 'object'
        or coalesce(length(btrim(p_report->>'title')),0) not between 3 and 120
        or coalesce(length(btrim(p_report->>'description')),0) not between 10 and 1000
        or coalesce(length(btrim(p_report->>'location')),0) not between 2 and 120
        or coalesce(p_report->>'item_type','') not in ('lost','found')
        or coalesce(p_report->>'category_id','') !~ '^[1-9][0-9]*$'
        or coalesce(p_report->>'event_date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
        raise exception 'Check the item name, description, category, location and date.' using errcode = '22023';
    end if;
    report_date := (p_report->>'event_date')::date;
    if report_date > (now() at time zone 'Asia/Manila')::date then
        raise exception 'The date cannot be in the future.' using errcode = '22023';
    end if;
    photo := nullif(p_report->>'image_url','');
    if photo is not null and (
        photo !~ '^[a-f0-9-]+/[a-f0-9-]+[.]jpg$'
        or split_part(photo,'/',1) <> actor::text
        or not exists (select 1 from storage.objects where bucket_id = 'report-photos' and name = photo)
    ) then
        raise exception 'Choose a photo uploaded by your account.' using errcode = '22023';
    end if;
    if p_contact is not null and p_contact <> 'null'::jsonb and (
        jsonb_typeof(p_contact) <> 'object'
        or (p_contact->>'consent') is distinct from 'true'
        or coalesce(p_contact->>'method','') not in ('email','messenger','phone')
        or coalesce(length(btrim(p_contact->>'value')),0) = 0
    ) then
        raise exception 'Confirm consent for the contact details you share.' using errcode = '22023';
    end if;
    -- Explicit field list prevents edits to ownership, status or other metadata.
    -- Editing removes the report and its photo from public listings until approval.
    update public.items set
        title = btrim(p_report->>'title'), description = btrim(p_report->>'description'),
        location = btrim(p_report->>'location'), item_type = p_report->>'item_type',
        category_id = (p_report->>'category_id')::bigint, event_date = report_date,
        image_url = photo, status = 'pending'
    where id = item.id and user_id = actor;
    delete from public.report_contacts where item_id = item.id;
    if p_contact is not null and p_contact <> 'null'::jsonb then
        -- The contact table constraints validate the domain, phone number and URL.
        insert into public.report_contacts (item_id, method, value, consent)
        values (item.id, p_contact->>'method', btrim(p_contact->>'value'), true);
    end if;
    return jsonb_build_object('id', item.id, 'status', 'pending');
end;
$$;
revoke all on function public.manage_own_report(bigint,text,text,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.manage_own_report(bigint,text,text,jsonb,jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
