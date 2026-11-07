-- Run this entire file in Supabase SQL Editor once before using photo uploads.
-- Uses items.image_url to store a private object path, not a public URL.
begin;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-photos', 'report-photos', false, 2097152, array['image/jpeg'])
on conflict (id) do update set public = false,
file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Upload own report photos" on storage.objects;
create policy "Upload own report photos" on storage.objects for insert to authenticated
with check (bucket_id = 'report-photos' and (storage.foldername(name))[1] = (select auth.uid())::text
and lower(storage.extension(name)) = 'jpg');

drop policy if exists "Read published report photos" on storage.objects;
create policy "Read published report photos" on storage.objects for select to anon, authenticated
using (bucket_id = 'report-photos' and exists (
    select 1 from public.items i where i.image_url = name and i.status in ('approved', 'claimed')
));

drop policy if exists "Read own or admin report photos" on storage.objects;
create policy "Read own or admin report photos" on storage.objects for select to authenticated
using (bucket_id = 'report-photos' and (
    (storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_admin())
));

-- Photos cannot be overwritten. A report must reference a photo in its owner's folder.
alter table public.items drop constraint if exists items_photo_owner;
alter table public.items add constraint items_photo_owner check (
    image_url is null or (split_part(image_url, '/', 1) = user_id::text
    and image_url ~ '^[a-f0-9-]+/[a-f0-9-]+[.]jpg$')
) not valid;
commit;

-- Test after setup:
-- 1. Submit a photo report. Owner and administrator can view its photo.
-- 2. Signed-out visitors cannot retrieve the pending photo.
-- 3. Approve the report. Its photo becomes visible with the public listing.
-- Unattached uploads from interrupted submissions remain private. Remove those
-- manually using Storage > report-photos after checking no item references them.
