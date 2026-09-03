# Product handover

EduStack is FiscalStack Solutions' white-label, multi-tenant school SaaS. The current release is a secure database foundation plus a static platform control-centre prototype. PostgreSQL is the source of truth; browser storage is not used.

The migration defines tenants, branding, modules, users/roles/permissions, academics, students, links, attendance, assessments/results, finance foundations, announcements, invitations, and audit logs. Platform-only mutations go through authenticated Edge Functions. School data is protected by RLS and role-aware policies.

Current limitations: the static client has no complete sign-in form or school workspace CRUD, invitation email delivery and acceptance are not implemented, storage policies are pending, and custom-domain routing is documented rather than hosted. Next priorities are storage, acceptance flow, school administration screens, automated Supabase tests, MFA/rate limiting, and production deployment.
