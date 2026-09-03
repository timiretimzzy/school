# Technical audit

## Current state

EduStack is a static HTML/CSS/ES-modules frontend (GitHub Pages compatible)
backed by Supabase Auth/PostgreSQL/RLS and three Edge Functions
(`create-tenant`, `invite-user`, `accept-invitation`). It implements a
complete vertical slice: platform admin onboarding through school admin
setup, teacher attendance/assessments, and student/parent portals with
applied white-label branding. See `README.md` for the current feature list
and `docs/TESTING.md` for the acceptance test plan.

## Findings

- **Works:** role-based workspaces with a context switcher, dynamic branding
  application, tenant onboarding via a secure Edge Function, academic setup
  CRUD, student/staff CRUD, teacher-assignment-scoped attendance and
  assessments, published-only student/parent result visibility, audience/
  date-scoped announcements, invitation issuance and acceptance.
- **Partial:** production hostname → tenant resolution is not implemented
  (users pick their workspace from a context switcher instead of a verified
  domain); invitation emails are not sent (the raw token is shown once to the
  inviter to relay manually); there is no automated test suite.
- **Out of MVP scope (by design):** library, transport, boarding, payroll,
  LMS, procurement, timetable, fee collection UI — see `PRODUCT_MASTER.md`
  and `docs/ROADMAP.md`.
- **Security posture:** every tenant-owned table has RLS; teacher writes are
  scoped to `teacher_assignments`, not just role permission; student/parent
  result reads are restricted to published assessments; announcements are
  audience/date filtered at the RLS layer. See `docs/SECURITY.md`.

## Recommended next steps

Add an automated RLS test suite (e.g. `pgTAP` or scripted client tests per
`docs/TESTING.md`), production hostname resolution, transactional email for
invitations, and MFA/monitoring/backup runbooks before onboarding a real
paying customer.
