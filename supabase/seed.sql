-- Fictional development-only data. Do not run as production seed.
insert into public.tenants (name, slug, motto) values
 ('Demo High School', 'demo-high-school', 'Learning for tomorrow')
on conflict (slug) do nothing;
insert into public.tenant_branding (tenant_id, display_name)
select id, name from public.tenants where slug='demo-high-school'
on conflict (tenant_id) do nothing;
insert into public.tenant_modules (tenant_id,module_key)
select t.id,m.module_key from public.tenants t cross join public.modules m
where t.slug='demo-high-school' and m.module_key in ('student_management','academics','attendance')
on conflict do nothing;
