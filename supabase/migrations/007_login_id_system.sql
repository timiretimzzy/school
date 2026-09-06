-- Migration 007: Globally unique Login ID system
--
-- Adds login_id column to students, staff_profiles (teachers), and parent_profiles.
-- login_id format: Prefix + 6 uppercase alphanumeric chars (e.g., STU-7K4M92, TCH-X8P3Q1, PAR-9M2QZR)
-- Uniqueness is global (across all tenants), enforced by UNIQUE constraint.
-- Generated server-side via Edge Function using Supabase Admin API.
-- Never reused. Database-enforced uniqueness.

-- Add login_id to students table (global unique, not scoped to tenant)
alter table public.students add column if not exists login_id text;
create unique index if not exists students_login_id_idx on public.students (login_id) where login_id is not null;

-- Add login_id to staff_profiles table (for teachers and staff)
alter table public.staff_profiles add column if not exists login_id text;
create unique index if not exists staff_profiles_login_id_idx on public.staff_profiles (login_id) where login_id is not null;

-- Add login_id to parent_profiles table
alter table public.parent_profiles add column if not exists login_id text;
create unique index if not exists parent_profiles_login_id_idx on public.parent_profiles (login_id) where login_id is not null;

-- Comments documenting the format
comment on column public.students.login_id is 'Globally unique login ID in format STU-XXXXXX. Generated server-side. Must be unique across all tenants.';
comment on column public.staff_profiles.login_id is 'Globally unique login ID in format TCH-XXXXXX. Generated server-side. Must be unique across all tenants.';
comment on column public.parent_profiles.login_id is 'Globally unique login ID in format PAR-XXXXXX. Generated server-side. Must be unique across all tenants.';

-- Create the login_id generation function
create or replace function public.generate_login_id(prefix text) returns text language plpgsql immutable as $$
declare
  candidate text;
  collides boolean;
begin
  loop
    -- Generate: prefix + 6 random uppercase alphanumeric characters
    candidate := prefix || upper(substring(md5(random()::text), 1, 6));
    -- Check for collision (global uniqueness)
    select into collides exists(
      select 1 from public.students where login_id = candidate
      union all
      select 1 from public.staff_profiles where login_id = candidate
      union all
      select 1 from public.parent_profiles where login_id = candidate
    );
    if not collides then
      return candidate;
    end if;
  end loop;
end
$$;

-- Grant execute on the function for the Edge Functions
grant execute on public.generate_login_id(to role service_role);