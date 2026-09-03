# Database schema

Migrations apply in order and are the source of truth:

1. `001_mvp_foundation.sql` — platform entities (`tenants`, domains,
   branding, modules), authorization (`platform_admins`, memberships, roles,
   permissions), academic and student entities, attendance,
   assessments/results, finance foundations, announcements, invitations, and
   audit logs, plus baseline RLS.
2. `002_storage.sql` — storage buckets and tenant-scoped object policies.
3. `003_parents_and_invitations.sql` — `parent_profiles` and
   `parent_student_relationships` (one parent → many students),
   `is_linked_parent`, extended `is_linked_student`, announcement
   audience/date-scoped RLS, and a self-read policy so an invited (not yet
   member) user can see their own pending invitation.
4. `004_teacher_scoped_permissions.sql` — tightens attendance/assessment/
   result write policies so a teacher must be assigned (via
   `teacher_assignments`) to the specific class/subject, not merely hold the
   role-level permission; also restricts student/parent result reads to
   published assessments only.

All tenant-owned rows have `tenant_id`. RLS is enabled on every application
table. `has_tenant_membership`, `has_permission`, `is_linked_student`,
`is_linked_parent`, `is_admin_like`, `is_assigned_to_class`, and
`is_assigned_to_class_subject` are `security definer` helpers with an
explicit `search_path`.
