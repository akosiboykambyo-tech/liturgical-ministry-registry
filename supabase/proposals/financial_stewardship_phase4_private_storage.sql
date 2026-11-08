-- Phase 4 TEST ONLY. Private holding bucket, no user upload/read grants.
-- A later reviewed Storage RLS migration must authorize parish-scoped files.
-- This deployment is deliberately deny-by-default for browser clients.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('fs-private','fs-private',false,26214400,
  array['application/pdf','image/jpeg','image/png','image/webp']::text[])
on conflict(id) do nothing;
