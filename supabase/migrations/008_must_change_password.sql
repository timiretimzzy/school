-- Migration 008: Add must_change_password column to tenant_memberships
-- This column tracks whether a user must change their password on first login

alter table public.tenant_memberships add column if not exists must_change_password boolean not null default true;

-- Set must_change_password to true for existing records that don't have it set
update public.tenant_memberships set must_change_password = true where must_change_password is null;

-- Add comment for documentation
comment on column public.tenant_memberships.must_change_password is 'When true, the user must change their password on next login';