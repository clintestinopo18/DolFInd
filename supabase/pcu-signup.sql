-- Run in Supabase SQL Editor, then enable this function under
-- Authentication > Hooks > Before User Created (Postgres function).
-- Keep Confirm email enabled. Existing accounts are not changed.
create or replace function public.restrict_pcu_signup(event jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
begin
    if coalesce(event->'user'->>'email', '') !~* '^[^[:space:]@]+@pcu[.]edu[.]ph$' then
        return jsonb_build_object('error', jsonb_build_object(
            'http_code', 403,
            'message', 'Registration requires a PCU email address ending in @pcu.edu.ph.'
        ));
    end if;
    return '{}'::jsonb;
end;
$$;

revoke execute on function public.restrict_pcu_signup(jsonb) from public, anon, authenticated;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.restrict_pcu_signup(jsonb) to supabase_auth_admin;
