-- Run in Supabase SQL Editor after the existing DolFind setup.
-- History starts when this migration is installed; no earlier decisions are invented.
begin;
create table if not exists public.report_review_history (
    id bigint generated always as identity primary key,
    item_id bigint not null,
    report_title text not null,
    reviewer_id uuid not null,
    reviewer_name text not null,
    previous_status text not null,
    new_status text not null check (new_status in ('approved','rejected','pending')),
    reason text,
    reviewed_at timestamptz not null default now(),
    check (new_status <> 'rejected' or (reason is not null and length(btrim(reason)) between 10 and 1000))
);
-- Deliberately no report foreign key: deleting a report must not erase audit history.
create index if not exists report_review_history_item on public.report_review_history(item_id,id desc);
create index if not exists report_review_history_date on public.report_review_history(reviewed_at desc,id desc);
alter table public.report_review_history enable row level security;
revoke all on public.report_review_history from anon,authenticated;
grant select on public.report_review_history to authenticated;
drop policy if exists admin_read_review_history on public.report_review_history;
create policy admin_read_review_history on public.report_review_history for select to authenticated using (public.is_admin());

create or replace function public.record_report_review()
returns trigger language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); note text; actor_name text;
begin
    if old.status is not distinct from new.status then return new; end if;
    -- Returning an item and an owner's resubmission are not moderation decisions.
    if new.status not in ('approved','rejected','pending') then return new; end if;
    if new.status = 'pending' and
       (not coalesce(public.is_admin(),false) or
        (new.user_id = actor and coalesce(current_setting('dolfind.review_action',true),'') <> 'true')) then
        return new;
    end if;
    if actor is null or not coalesce(public.is_admin(),false) then
        raise exception 'Administrator access is required to review reports.' using errcode='42501';
    end if;
    if new.status = 'rejected' then
        note := nullif(btrim(current_setting('dolfind.review_reason',true)),'');
        if note is null or length(note) not between 10 and 1000 then
            raise exception 'Give a rejection reason between 10 and 1,000 characters.' using errcode='22023';
        end if;
    end if;
    select coalesce(nullif(btrim(full_name),''),'Administrator') into actor_name from public.profiles where id=actor;
    insert into public.report_review_history(item_id,report_title,reviewer_id,reviewer_name,previous_status,new_status,reason)
    values(new.id,new.title,actor,coalesce(actor_name,'Administrator'),old.status,new.status,note);
    return new;
end;
$$;
revoke all on function public.record_report_review() from public,anon,authenticated;
drop trigger if exists record_report_review on public.items;
create trigger record_report_review after update of status on public.items
for each row execute function public.record_report_review();

create or replace function public.review_report(p_id bigint,p_expected text,p_status text,p_reason text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare item public.items%rowtype;
begin
    if auth.uid() is null or not coalesce(public.is_admin(),false) then
        raise exception 'Administrator access is required.' using errcode='42501';
    end if;
    select * into item from public.items where id=p_id for update;
    if not found then raise exception 'This report no longer exists.' using errcode='22023'; end if;
    if p_expected is distinct from md5(to_jsonb(item)::text) then
        raise exception 'This report changed. Refresh and review it again.' using errcode='40001';
    end if;
    if p_status is null or not ((item.status='pending' and p_status in ('approved','rejected')) or
        (item.status in ('approved','rejected') and p_status='pending')) then
        raise exception 'This review action is not available for the current status.' using errcode='22023';
    end if;
    perform set_config('dolfind.review_reason',coalesce(p_reason,''),true);
    perform set_config('dolfind.review_action','true',true);
    update public.items set status=p_status where id=p_id;
    perform set_config('dolfind.review_reason','',true);
    perform set_config('dolfind.review_action','',true);
    return jsonb_build_object('id',p_id,'status',p_status);
end;
$$;

create or replace function public.admin_review_list(p_view text default 'pending',p_page integer default 0)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare entries jsonb; total bigint;
begin
    if auth.uid() is null or not coalesce(public.is_admin(),false) then
        raise exception 'Administrator access is required.' using errcode='42501';
    end if;
    if p_page is null or p_page < 0 or p_page > 100000 or p_view is null or p_view not in ('pending','approved','rejected','claimed','history') then
        raise exception 'Invalid review filter.' using errcode='22023';
    end if;
    if p_view='history' then
        select count(*) into total from public.report_review_history;
        select coalesce(jsonb_agg(to_jsonb(entry)),'[]'::jsonb) into entries from (
            select * from public.report_review_history order by reviewed_at desc,id desc limit 12 offset p_page*12
        ) entry;
    else
        select count(*) into total from public.items where status=p_view;
        select coalesce(jsonb_agg(entry.data),'[]'::jsonb) into entries from (
            select to_jsonb(i) || jsonb_build_object('version',md5(to_jsonb(i)::text),
                'category_name',(select c.name from public.categories c where c.id=i.category_id),
                'rejection_reason',case when i.status='rejected' then
                    (select h.reason from public.report_review_history h where h.item_id=i.id and h.new_status='rejected' order by h.id desc limit 1) end) as data
            from public.items i where i.status=p_view
            order by case when p_view='pending' then i.created_at end asc,
                     case when p_view<>'pending' then i.created_at end desc,i.id asc
            limit 12 offset p_page*12
        ) entry;
    end if;
    return jsonb_build_object('items',entries,'count',total);
end;
$$;

-- Only owners can request their current rejection feedback; no audit identities leak.
create or replace function public.own_report_feedback(p_ids bigint[])
returns jsonb language sql stable security definer set search_path = '' as $$
    select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'reason',
        (select h.reason from public.report_review_history h where h.item_id=i.id and h.new_status='rejected' order by h.id desc limit 1))),'[]'::jsonb)
    from public.items i where i.id=any(p_ids[1:24]) and i.user_id=auth.uid() and i.status='rejected';
$$;
revoke all on function public.review_report(bigint,text,text,text) from public,anon,authenticated;
revoke all on function public.admin_review_list(text,integer) from public,anon,authenticated;
revoke all on function public.own_report_feedback(bigint[]) from public,anon,authenticated;
grant execute on function public.review_report(bigint,text,text,text) to authenticated;
grant execute on function public.admin_review_list(text,integer) to authenticated;
grant execute on function public.own_report_feedback(bigint[]) to authenticated;
notify pgrst,'reload schema';
commit;
