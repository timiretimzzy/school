-- Migration 005: Staff email fields and invitation tracking.
--
-- These columns and indexes support the school-admin invitation workflow
-- where staff members are added with an email address and then invited to
-- create their login via the invite-user Edge Function. The raw invitation
-- token is surfaced once to the inviter (email delivery is not yet wired
-- up — see docs/ROADMAP.md) and must be relayed manually.

-- Staff profiles gain an email column (the address used for invitation
-- matching) and a last_invited_at timestamp for tracking.
alter table public.staff_profiles add column if not exists email citext;
alter table public.staff_profiles add column if not exists last_invited_at timestamptz;

-- Index to accelerate email-based staff lookups within a tenant.
create index if not exists staff_profiles_email_idx on public.staff_profiles (tenant_id, lower(email));

-- Invitation tracking: record whether the raw token has been surfaced to
-- the inviter (and thus can be relayed to the invitee). The self-read
-- policy created in 003 already lets an invited user look up their own
-- pending invitation by email; this index accelerates that query path.
alter table public.tenant_invitations add column if not exists token_delivered boolean not null default false;
create index if not exists tenant_invitations_email_idx on public.tenant_invitations (tenant_id, lower(email));
