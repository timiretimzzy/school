-- Fictional development-only demo data for "Demo High School". Do not run
-- against a production database. This seed creates tenant-scoped rows only;
-- it does NOT and cannot create Supabase Auth users (email/password) or link
-- any user to a role. Follow docs/DEMO_CREDENTIALS.md to create the Auth
-- users and link them to the rows created here.

insert into public.tenants (name, slug, motto, status, subscription_plan, subscription_status)
values ('Demo High School', 'demo-high-school', 'Learning for tomorrow', 'active', 'standard', 'active')
on conflict (slug) do nothing;

insert into public.tenant_branding (tenant_id, display_name, primary_color, secondary_color, accent_color)
select id, 'Demo High School', '#123c69', '#2f80ed', '#f2b705' from public.tenants where slug = 'demo-high-school'
on conflict (tenant_id) do nothing;

insert into public.tenant_modules (tenant_id, module_key)
select t.id, m.module_key from public.tenants t cross join public.modules m
where t.slug = 'demo-high-school'
  and m.module_key in ('student_management', 'academics', 'attendance', 'parent_portal')
on conflict do nothing;

insert into public.academic_years (tenant_id, name, starts_on, ends_on, is_current)
select id, '2025/2026', date '2025-09-01', date '2026-07-31', true from public.tenants where slug = 'demo-high-school'
on conflict do nothing;

insert into public.terms (tenant_id, academic_year_id, name, starts_on, ends_on)
select t.id, y.id, term.name, term.starts_on, term.ends_on
from public.tenants t
join public.academic_years y on y.tenant_id = t.id and y.name = '2025/2026'
cross join (values
  ('Term 1', date '2025-09-01', date '2025-12-05'),
  ('Term 2', date '2026-01-12', date '2026-04-03'),
  ('Term 3', date '2026-04-20', date '2026-07-31')
) as term(name, starts_on, ends_on)
where t.slug = 'demo-high-school'
on conflict do nothing;

insert into public.classes (tenant_id, name)
select id, class_name from public.tenants, unnest(array['Grade 9A', 'Grade 9B', 'Grade 10A']) as class_name
where slug = 'demo-high-school'
on conflict do nothing;

insert into public.subjects (tenant_id, name, code)
select t.id, s.name, s.code
from public.tenants t
cross join (values ('Mathematics', 'MATH'), ('English', 'ENG'), ('Science', 'SCI')) as s(name, code)
where t.slug = 'demo-high-school'
on conflict do nothing;

insert into public.students (tenant_id, admission_number, first_name, last_name, date_of_birth, gender, status)
select t.id, s.admission_number, s.first_name, s.last_name, s.date_of_birth, s.gender, 'active'
from public.tenants t
cross join (values
  ('DHS-0001', 'Amara', 'Okafor', date '2010-03-14', 'female'),
  ('DHS-0002', 'Liam', 'Mensah', date '2010-07-22', 'male'),
  ('DHS-0003', 'Zanele', 'Dube', date '2010-11-02', 'female')
) as s(admission_number, first_name, last_name, date_of_birth, gender)
where t.slug = 'demo-high-school'
on conflict do nothing;

insert into public.student_enrolments (tenant_id, student_id, class_id, academic_year_id)
select t.id, st.id, c.id, y.id
from public.tenants t
join public.students st on st.tenant_id = t.id and st.admission_number = 'DHS-0001'
join public.classes c on c.tenant_id = t.id and c.name = 'Grade 9A'
join public.academic_years y on y.tenant_id = t.id and y.name = '2025/2026'
where t.slug = 'demo-high-school'
on conflict do nothing;

insert into public.student_enrolments (tenant_id, student_id, class_id, academic_year_id)
select t.id, st.id, c.id, y.id
from public.tenants t
join public.students st on st.tenant_id = t.id and st.admission_number = 'DHS-0002'
join public.classes c on c.tenant_id = t.id and c.name = 'Grade 9A'
join public.academic_years y on y.tenant_id = t.id and y.name = '2025/2026'
where t.slug = 'demo-high-school'
on conflict do nothing;

insert into public.student_enrolments (tenant_id, student_id, class_id, academic_year_id)
select t.id, st.id, c.id, y.id
from public.tenants t
join public.students st on st.tenant_id = t.id and st.admission_number = 'DHS-0003'
join public.classes c on c.tenant_id = t.id and c.name = 'Grade 10A'
join public.academic_years y on y.tenant_id = t.id and y.name = '2025/2026'
where t.slug = 'demo-high-school'
on conflict do nothing;

insert into public.announcements (tenant_id, title, body, audience, published_at)
select id, 'Welcome to the new academic year', 'Term 1 begins on 1 September. Please review the updated timetable.', 'all', now()
from public.tenants where slug = 'demo-high-school'
on conflict do nothing;
