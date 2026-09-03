create extension if not exists pgcrypto;
create extension if not exists citext;

create type public.platform_role as enum ('super_admin','support_admin');
create type public.membership_role as enum ('school_admin','principal','registrar','teacher','finance_officer','librarian','parent','student');
create type public.tenant_status as enum ('trial','active','suspended','cancelled');

create table public.tenants (
  id uuid primary key default gen_random_uuid(), name text not null, slug text unique not null,
  motto text, status public.tenant_status not null default 'trial',
  subscription_plan text not null default 'trial', subscription_status text not null default 'trial',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.tenant_domains (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants on delete cascade,
  domain text unique not null, is_primary boolean not null default false,
  verification_status text not null default 'pending', verified_at timestamptz, created_at timestamptz not null default now()
);
create table public.tenant_branding (
  tenant_id uuid primary key references public.tenants on delete cascade, display_name text, logo_url text,
  favicon_url text, login_background_url text, primary_color text not null default '#173B6C',
  secondary_color text not null default '#E6B325', accent_color text not null default '#FFFFFF',
  custom_css_variables jsonb not null default '{}'::jsonb, terminology jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.modules (module_key text primary key, name text not null, description text);
insert into public.modules(module_key,name) values
 ('student_management','Student Management'),('attendance','Attendance'),('academics','Academics'),
 ('finance','Finance'),('parent_portal','Parent Portal'),('lms','Learning'),('library','Library')
on conflict do nothing;
create table public.tenant_modules (
 tenant_id uuid references public.tenants on delete cascade, module_key text references public.modules,
 enabled boolean not null default true, enabled_at timestamptz not null default now(),
 primary key(tenant_id,module_key)
);
create table public.platform_admins (user_id uuid primary key references auth.users on delete cascade, role public.platform_role not null default 'super_admin', created_at timestamptz default now());
create table public.tenant_memberships (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants on delete cascade,
 user_id uuid not null references auth.users on delete cascade, role public.membership_role not null,
 active boolean not null default true, created_at timestamptz default now(), updated_at timestamptz default now(),
 unique(tenant_id,user_id,role)
);
create table public.roles (role public.membership_role primary key);
insert into public.roles values ('school_admin'),('principal'),('registrar'),('teacher'),('finance_officer'),('librarian'),('parent'),('student') on conflict do nothing;
create table public.permissions (permission_key text primary key, description text);
insert into public.permissions values
 ('manage_tenant','Manage school settings'),('manage_students','Manage students'),('manage_academics','Manage academic structure'),
 ('record_attendance','Record attendance'),('manage_results','Manage assessments and results'),('view_finance','View finance records'),
 ('manage_announcements','Manage announcements') on conflict do nothing;
create table public.role_permissions (role public.membership_role references public.roles, permission_key text references public.permissions, primary key(role,permission_key));
insert into public.role_permissions select r::public.membership_role, p from (values
 ('school_admin','manage_tenant'),('school_admin','manage_students'),('school_admin','manage_academics'),('school_admin','record_attendance'),('school_admin','manage_results'),('school_admin','view_finance'),('school_admin','manage_announcements'),
 ('principal','manage_students'),('principal','manage_academics'),('principal','record_attendance'),('principal','manage_results'),('principal','manage_announcements'),
 ('registrar','manage_students'),('registrar','manage_academics'),('teacher','record_attendance'),('teacher','manage_results'),('finance_officer','view_finance')
) x(r,p) on conflict do nothing;
create table public.academic_years (id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants on delete cascade, name text not null, starts_on date, ends_on date, is_current boolean default false, unique(tenant_id,name));
create table public.terms (id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants on delete cascade, academic_year_id uuid not null references public.academic_years on delete cascade, name text not null, starts_on date, ends_on date, unique(academic_year_id,name));
create table public.grades_or_forms (id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants on delete cascade, name text not null, unique(tenant_id,name));
create table public.classes (id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants on delete cascade, name text not null, grade_or_form_id uuid references public.grades_or_forms, unique(tenant_id,name));
create table public.subjects (id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants on delete cascade, name text not null, code text, unique(tenant_id,name));
create table public.staff_profiles (id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants on delete cascade, user_id uuid references auth.users, employee_number text, first_name text not null, last_name text not null, department text, job_title text, active boolean default true, unique(tenant_id,employee_number));
create table public.teacher_assignments (id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants on delete cascade, teacher_user_id uuid not null references auth.users, class_id uuid not null references public.classes, subject_id uuid not null references public.subjects, unique(tenant_id,teacher_user_id,class_id,subject_id));
create table public.students (id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants on delete cascade, admission_number text not null, first_name text not null, last_name text not null, middle_name text, date_of_birth date, gender text, email text, phone text, guardian_details jsonb not null default '{}'::jsonb, status text not null default 'active', created_at timestamptz default now(), unique(tenant_id,admission_number));
create table public.student_links (tenant_id uuid not null references public.tenants on delete cascade, student_id uuid not null references public.students on delete cascade, user_id uuid not null references auth.users on delete cascade, relationship text not null, primary key(student_id,user_id));
create table public.student_enrolments (id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants on delete cascade, student_id uuid not null references public.students on delete cascade, class_id uuid not null references public.classes, academic_year_id uuid not null references public.academic_years, unique(student_id,academic_year_id));
create table public.attendance_records (id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants on delete cascade, student_id uuid not null references public.students on delete cascade, class_id uuid references public.classes, attendance_date date not null, status text not null check(status in('present','absent','late','excused')), recorded_by uuid references auth.users, unique(tenant_id,student_id,attendance_date));
create table public.assessments (id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants on delete cascade, subject_id uuid references public.subjects, class_id uuid references public.classes, term_id uuid references public.terms, name text not null, maximum_mark numeric not null default 100 check(maximum_mark>0), weighting numeric check(weighting is null or weighting between 0 and 100), status text not null default 'draft' check(status in('draft','published')));
create table public.assessment_results (id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants on delete cascade, assessment_id uuid not null references public.assessments on delete cascade, student_id uuid not null references public.students on delete cascade, mark numeric not null check(mark>=0), comment text, entered_by uuid references auth.users, entered_at timestamptz default now(), unique(assessment_id,student_id));
create table public.fee_invoices (id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants on delete cascade, student_id uuid references public.students, invoice_number text not null, currency text default 'USD', amount numeric not null check(amount>=0), due_date date, status text default 'open', unique(tenant_id,invoice_number));
create table public.payments (id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants on delete cascade, invoice_id uuid references public.fee_invoices, amount numeric not null check(amount>=0), currency text default 'USD', paid_at timestamptz default now(), reference text);
create table public.announcements (id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants on delete cascade, title text not null, body text not null, audience text not null default 'all', published_at timestamptz, expires_at timestamptz, created_by uuid references auth.users);
create table public.tenant_invitations (id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants on delete cascade, email citext not null, role public.membership_role not null, token_hash text not null unique, expires_at timestamptz not null, accepted_at timestamptz, invited_by uuid references auth.users, created_at timestamptz default now());
create table public.audit_logs (id bigint generated always as identity primary key, tenant_id uuid references public.tenants on delete cascade, actor_id uuid references auth.users, action text not null, entity_type text, entity_id text, before_data jsonb, after_data jsonb, created_at timestamptz default now());

create or replace function public.is_platform_admin() returns boolean language sql stable security definer set search_path=public,pg_temp as $$ select exists(select 1 from public.platform_admins where user_id=auth.uid()) $$;
create or replace function public.has_tenant_membership(t uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$ select public.is_platform_admin() or exists(select 1 from public.tenant_memberships where tenant_id=t and user_id=auth.uid() and active) $$;
create or replace function public.has_permission(t uuid,p text) returns boolean language sql stable security definer set search_path=public,pg_temp as $$ select public.is_platform_admin() or exists(select 1 from public.tenant_memberships m join public.role_permissions rp on rp.role=m.role where m.tenant_id=t and m.user_id=auth.uid() and m.active and rp.permission_key=p) $$;
create or replace function public.is_linked_student(s uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$ select exists(select 1 from public.student_links where student_id=s and user_id=auth.uid()) or exists(select 1 from public.tenant_memberships m where m.user_id=auth.uid() and m.role='student' and exists(select 1 from public.students st where st.id=s and st.tenant_id=m.tenant_id)) $$;

do $$ declare t text; begin
 for t in select tablename from pg_tables where schemaname='public' and tablename not in ('modules','roles','permissions','role_permissions') loop
   execute format('alter table public.%I enable row level security',t);
 end loop;
end $$;
create policy tenants_read on public.tenants for select using(is_platform_admin() or has_tenant_membership(id));
create policy tenants_manage on public.tenants for all using(is_platform_admin()) with check(is_platform_admin());
create policy memberships_read on public.tenant_memberships for select using(is_platform_admin() or user_id=auth.uid() or has_permission(tenant_id,'manage_tenant'));
create policy membership_manage on public.tenant_memberships for all using(is_platform_admin() or has_permission(tenant_id,'manage_tenant')) with check(is_platform_admin() or has_permission(tenant_id,'manage_tenant'));
do $$ declare t text; begin
 for t in select tablename from pg_tables where schemaname='public' and tablename in ('tenant_domains','tenant_branding','tenant_modules','academic_years','terms','grades_or_forms','classes','subjects','staff_profiles','teacher_assignments','students','student_links','student_enrolments','attendance_records','assessments','fee_invoices','payments','announcements','tenant_invitations') loop
   execute format('create policy tenant_access_%I on public.%I for all using(has_tenant_membership(tenant_id)) with check(has_tenant_membership(tenant_id))',t,t);
 end loop;
end $$;
create policy results_read on public.assessment_results for select using(has_permission(tenant_id,'manage_results') or is_linked_student(student_id));
create policy results_write on public.assessment_results for insert with check(has_permission(tenant_id,'manage_results') and mark <= (select maximum_mark from public.assessments a where a.id=assessment_id and a.tenant_id=assessment_results.tenant_id));
create policy audit_read on public.audit_logs for select using(is_platform_admin() or has_tenant_membership(tenant_id));
drop policy if exists tenant_access_tenant_branding on public.tenant_branding;
create policy branding_read on public.tenant_branding for select using(has_tenant_membership(tenant_id));
create policy branding_manage on public.tenant_branding for all using(has_permission(tenant_id,'manage_tenant')) with check(has_permission(tenant_id,'manage_tenant'));
drop policy if exists tenant_access_tenant_domains on public.tenant_domains;
create policy domains_platform on public.tenant_domains for all using(is_platform_admin()) with check(is_platform_admin());
drop policy if exists tenant_access_tenant_modules on public.tenant_modules;
create policy modules_platform on public.tenant_modules for all using(is_platform_admin()) with check(is_platform_admin());
drop policy if exists tenant_access_students on public.students;
create policy students_read on public.students for select using(has_permission(tenant_id,'manage_students') or is_linked_student(id));
create policy students_write on public.students for all using(has_permission(tenant_id,'manage_students')) with check(has_permission(tenant_id,'manage_students'));
drop policy if exists tenant_access_fee_invoices on public.fee_invoices;
drop policy if exists tenant_access_payments on public.payments;
create policy finance_invoices on public.fee_invoices for all using(has_permission(tenant_id,'view_finance')) with check(has_permission(tenant_id,'view_finance'));
create policy finance_payments on public.payments for all using(has_permission(tenant_id,'view_finance')) with check(has_permission(tenant_id,'view_finance'));
drop policy if exists tenant_access_attendance_records on public.attendance_records;
create policy attendance_read on public.attendance_records for select using(has_permission(tenant_id,'record_attendance') or is_linked_student(student_id));
create policy attendance_write on public.attendance_records for all using(has_permission(tenant_id,'record_attendance')) with check(has_permission(tenant_id,'record_attendance'));
drop policy if exists tenant_access_student_enrolments on public.student_enrolments;
create policy enrolments_access on public.student_enrolments for select using(has_permission(tenant_id,'manage_students') or is_linked_student(student_id));
create policy enrolments_manage on public.student_enrolments for all using(has_permission(tenant_id,'manage_students')) with check(has_permission(tenant_id,'manage_students'));
