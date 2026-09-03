# Database schema

`supabase/migrations/001_mvp_foundation.sql` is the source of truth. It creates platform entities (`tenants`, domains, branding, modules), authorization (`platform_admins`, memberships, roles and permissions), academic and student entities, attendance, assessments/results, finance foundations, announcements, invitations, and audit logs.

All tenant-owned rows have `tenant_id`. RLS is enabled on every application table. `has_tenant_membership`, `has_permission`, and `is_linked_student` are security-definer helpers with an explicit `search_path`. Results use separate read/write policies and require a linked student or authorized result permission.
