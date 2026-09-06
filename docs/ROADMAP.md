# Roadmap

## Release 0 (superseded)

Backend architecture and database schema only, no working user workflows.

## Release 1 — current commercial MVP (this repository)

Complete, testable vertical slice across all ten MVP roles: platform admin
onboarding wizard, school admin academic setup/students/staff/announcements,
staff email invites with token relay, CSV import for students and staff,
teacher attendance and assessments scoped to assignments, student portal,
parent portal, and applied white-label branding. See `README.md` for the
exact feature list and `docs/TESTING.md` for the acceptance test plan.

## Known limitations to close before selling to a real school

- No production hostname → tenant resolution (slug/manual context switch only).
- No email delivery for invitations; the token is stored as a SHA-256 hash
  and is not surfaced to the inviter or frontend (see `docs/INVITATIONS.md`,
  `docs/DEMO_CREDENTIALS.md`). The `invite-user` function prevents duplicate
  pending invitations and tracks invitation timing on `staff_profiles`.
- No automated test suite (unit/integration/RLS); validation so far is
  manual/logical per `docs/TESTING.md`.
- No MFA, rate limiting, monitoring, backups/DR runbook, or independent
  penetration test.
- Finance (fee invoices/payments) tables exist but have no UI; out of MVP
  scope per the product brief.
- Report cards/printable transcripts are not implemented.

## Future releases (out of MVP scope)

1. Admissions workflow, timetable, in-app messaging/communication.
2. LMS/assignments, library, transport, boarding, HR/payroll.
3. Multi-campus support, SSO, public API, advanced analytics.
4. PWA/offline support.
