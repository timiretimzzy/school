-- Migration 006: Invitation student linking support.
--
-- Adds a metadata JSONB column to tenant_invitations so that the invite-user
-- Edge Function can record which student profile a student invitation refers
-- to. The accept-invitation function already reads invitation.metadata?.student_id
-- (see accept-invitation/index.ts); this migration provides that column.

alter table public.tenant_invitations
  add column if not exists metadata jsonb not null default '{}'::jsonb;

-- Index to accelerate lookups for pending student invitations by email.
create index if not exists tenant_invitations_token_delivered_idx
  on public.tenant_invitations (tenant_id)
  where accepted_at is null;
