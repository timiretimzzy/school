# Product handover

## Identity

- **Owner:** FiscalStack Solutions
- **Product:** EduStack Platform — multi-tenant, white-label school
  management SaaS. Not tied to any single school's identity.

## Status: Release 1 — commercial MVP

This is a real, working vertical slice, not a database schema plus a
prototype landing page. It covers the full journey described in
`PRODUCT_MASTER.md`: platform admin onboarding → school admin setup →
teachers → students → parents, with tenant data isolation and role
scoping enforced by PostgreSQL RLS (`supabase/migrations/`), privileged
mutations performed by Edge Functions (`supabase/functions/`), and a
static, no-build-step frontend (`app.js`, `js/`) suitable for GitHub Pages.

See `README.md` for the concrete feature list, `docs/DEMO_CREDENTIALS.md`
for how to stand up a demo tenant and users, and `docs/TESTING.md` for the
acceptance test plan, including explicit tenant/role/student/parent privacy
checks.

## Honest statement

**READY FOR TESTING** for the workflows listed in `README.md` and
`docs/TESTING.md`, once a Supabase project is linked, migrations are
applied, Edge Functions are deployed, and demo Auth users are created per
`docs/DEMO_CREDENTIALS.md` (Auth user creation cannot be scripted safely from
this repository). It is **not** production-ready: see
`docs/ROADMAP.md` for the specific gaps (email delivery, hostname
resolution, MFA, automated tests, monitoring/backups) that remain before
selling to a real school.
