create extension if not exists pgcrypto;
create type public.platform_role as enum ('super_admin','support');
create type public.tenant_status as enum ('trial','active','suspended','cancelled');
create type public.membership_role as enum ('school_admin','principal','registrar','teacher','finance','librarian','parent','student');

create table public.tenants(id uuid primary key default gen_random_uuid(),name text not null,slug text unique not null,motto text,status public.tenant_status not null default 'trial',created_at timestamptz default now());
create table public.tenant_domains(id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id) on delete cascade,domain text unique not null,is_primary boolean default false,verified_at timestamptz);
create table public.tenant_branding(tenant_id uuid primary key references public.tenants(id) on delete cascade,display_name text,logo_url text,favicon_url text,login_background_url text,primary_color text default '#173B6C',secondary_color text default '#E6B325',accent_color text default '#FFFFFF',terminology jsonb default '{}'::jsonb);
create table public.modules(module_key text primary key,name text not null);
insert into public.modules values('student_management','Student Management'),('attendance','Attendance'),('academics','Academics'),('finance','Finance'),('parent_portal','Parent Portal'),('lms','Learning'),('library','Library'),('transport','Transport') on conflict do nothing;
create table public.tenant_modules(tenant_id uuid references public.tenants(id) on delete cascade,module_key text references public.modules(module_key),enabled boolean default true,primary key(tenant_id,module_key));
create table public.platform_admins(user_id uuid primary key references auth.users(id) on delete cascade,role public.platform_role default 'super_admin');
create table public.tenant_memberships(id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id) on delete cascade,user_id uuid not null references auth.users(id) on delete cascade,role public.membership_role not null,active boolean default true,unique(tenant_id,user_id,role));

create table public.academic_years(id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id) on delete cascade,name text not null,starts_on date,ends_on date,is_current boolean default false,unique(tenant_id,name));
create table public.classes(id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id) on delete cascade,name text not null,unique(tenant_id,name));
create table public.subjects(id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id) on delete cascade,name text not null,code text,unique(tenant_id,name));
create table public.students(id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id) on delete cascade,admission_number text not null,first_name text not null,last_name text not null,date_of_birth date,active boolean default true,unique(tenant_id,admission_number));
create table public.student_enrolments(id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id) on delete cascade,student_id uuid references public.students(id) on delete cascade,class_id uuid references public.classes(id),academic_year_id uuid references public.academic_years(id));
create table public.attendance_records(id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id) on delete cascade,student_id uuid references public.students(id) on delete cascade,attendance_date date not null,status text check(status in('present','absent','late','excused')),recorded_by uuid references auth.users(id),unique(tenant_id,student_id,attendance_date));
create table public.assessments(id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id) on delete cascade,subject_id uuid references public.subjects(id),class_id uuid references public.classes(id),name text not null,maximum_mark numeric default 100,status text default 'draft');
create table public.assessment_results(id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id) on delete cascade,assessment_id uuid references public.assessments(id) on delete cascade,student_id uuid references public.students(id) on delete cascade,mark numeric not null,comment text,entered_by uuid references auth.users(id),unique(assessment_id,student_id));
create table public.fee_invoices(id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id) on delete cascade,student_id uuid references public.students(id),invoice_number text not null,currency text default 'USD',amount numeric not null,due_date date,status text default 'open',unique(tenant_id,invoice_number));
create table public.payments(id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id) on delete cascade,invoice_id uuid references public.fee_invoices(id),amount numeric not null,currency text default 'USD',paid_at timestamptz default now(),reference text);
create table public.announcements(id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id) on delete cascade,title text not null,body text not null,published_at timestamptz,created_by uuid references auth.users(id));
create table public.audit_logs(id bigint generated always as identity primary key,tenant_id uuid references public.tenants(id) on delete cascade,actor_id uuid references auth.users(id),action text not null,entity_type text,entity_id text,before_data jsonb,after_data jsonb,created_at timestamptz default now());

create or replace function public.is_platform_admin() returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from public.platform_admins where user_id=auth.uid())$$;
create or replace function public.is_tenant_member(t uuid) returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from public.tenant_memberships where tenant_id=t and user_id=auth.uid() and active=true)$$;

alter table public.tenants enable row level security; alter table public.tenant_domains enable row level security; alter table public.tenant_branding enable row level security; alter table public.tenant_modules enable row level security; alter table public.tenant_memberships enable row level security;
create policy "platform manages tenants" on public.tenants for all using(public.is_platform_admin()) with check(public.is_platform_admin());
create policy "platform manages domains" on public.tenant_domains for all using(public.is_platform_admin()) with check(public.is_platform_admin());
create policy "platform manages branding" on public.tenant_branding for all using(public.is_platform_admin()) with check(public.is_platform_admin());
create policy "platform manages modules" on public.tenant_modules for all using(public.is_platform_admin()) with check(public.is_platform_admin());
create policy "own memberships" on public.tenant_memberships for select using(user_id=auth.uid() or public.is_platform_admin());

alter table public.academic_years enable row level security; alter table public.classes enable row level security; alter table public.subjects enable row level security; alter table public.students enable row level security; alter table public.student_enrolments enable row level security; alter table public.attendance_records enable row level security; alter table public.assessments enable row level security; alter table public.assessment_results enable row level security; alter table public.fee_invoices enable row level security; alter table public.payments enable row level security; alter table public.announcements enable row level security; alter table public.audit_logs enable row level security;

create policy "tenant academic years" on public.academic_years for all using(public.is_tenant_member(tenant_id)) with check(public.is_tenant_member(tenant_id));
create policy "tenant classes" on public.classes for all using(public.is_tenant_member(tenant_id)) with check(public.is_tenant_member(tenant_id));
create policy "tenant subjects" on public.subjects for all using(public.is_tenant_member(tenant_id)) with check(public.is_tenant_member(tenant_id));
create policy "tenant students" on public.students for all using(public.is_tenant_member(tenant_id)) with check(public.is_tenant_member(tenant_id));
create policy "tenant enrolments" on public.student_enrolments for all using(public.is_tenant_member(tenant_id)) with check(public.is_tenant_member(tenant_id));
create policy "tenant attendance" on public.attendance_records for all using(public.is_tenant_member(tenant_id)) with check(public.is_tenant_member(tenant_id));
create policy "tenant assessments" on public.assessments for all using(public.is_tenant_member(tenant_id)) with check(public.is_tenant_member(tenant_id));
create policy "tenant results" on public.assessment_results for all using(public.is_tenant_member(tenant_id)) with check(public.is_tenant_member(tenant_id));
create policy "tenant invoices" on public.fee_invoices for all using(public.is_tenant_member(tenant_id)) with check(public.is_tenant_member(tenant_id));
create policy "tenant payments" on public.payments for all using(public.is_tenant_member(tenant_id)) with check(public.is_tenant_member(tenant_id));
create policy "tenant announcements" on public.announcements for all using(public.is_tenant_member(tenant_id)) with check(public.is_tenant_member(tenant_id));
create policy "tenant audit read" on public.audit_logs for select using(public.is_tenant_member(tenant_id) or public.is_platform_admin());

-- IMPORTANT: replace broad tenant-member policies with granular role-aware policies before production.
