insert into storage.buckets (id,name,public) values
 ('tenant-assets','tenant-assets',false),('student-documents','student-documents',false),('announcements','announcements',false)
on conflict (id) do nothing;
create policy tenant_asset_read on storage.objects for select using (
 bucket_id in ('tenant-assets','student-documents','announcements') and
 exists (select 1 from public.tenant_memberships m where m.user_id=auth.uid() and m.active and (storage.foldername(name))[1]=m.tenant_id::text)
);
create policy tenant_asset_write on storage.objects for insert with check (
 bucket_id in ('tenant-assets','student-documents','announcements') and
 exists (select 1 from public.tenant_memberships m where m.user_id=auth.uid() and m.active and (storage.foldername(name))[1]=m.tenant_id::text)
);
