# EduStack Platform: Master Product Context

## Identity
- Company: FiscalStack Solutions
- Working product name: EduStack Platform
- Category: Multi-tenant, white-label School Management, Learning and Operations SaaS
- This is not tied to any school.

## Commercial model
FiscalStack provides infrastructure. Each school is a tenant with isolated data, users, enabled modules, branding and domain.

Core flow:
Domain -> Tenant resolution -> Branding -> Authentication -> Authorization -> Tenant-scoped data.

## Roles
Platform: Super Admin, Support.
School: School Admin, Principal, Registrar, Teacher, Finance, Librarian, Parent, Student.

## Implemented foundation
- GitHub Pages-compatible frontend
- Supabase integration point
- PostgreSQL tenant schema
- Tenant branding
- Tenant domains
- Module entitlements
- Platform administrators
- Tenant memberships
- Academic years/classes/subjects
- Students/enrolments
- Attendance
- Assessments/results
- Fees/invoices/payments foundation
- Announcements
- Audit log table
- RLS baseline

## Product modules roadmap
1. Admissions
2. Student information
3. Academic structure
4. Attendance
5. Assessments/exams/results/report cards
6. Timetable
7. Parent portal
8. Student portal
9. Teacher workspace
10. Fees
11. Communication
12. LMS/resources/assignments
13. Library
14. Transport
15. Boarding
16. HR
17. Analytics
18. Integrations
19. PWA/offline
20. Multi-campus/API ecosystem

## Critical security rules
- Every tenant-owned record has tenant_id.
- Database RLS is the isolation boundary.
- Frontend hiding is never security.
- Never expose Supabase service_role key.
- Role-aware RLS must replace broad baseline policies before production.
- Real customer data must not be used before security testing and backups.

## Releases
Release 0: current commercial foundation.
Release 1: commercial MVP, complete platform admin, tenant onboarding, school admin, students, academics, attendance, assessments/results, announcements, basic fees.
Release 2: parents, admissions, timetables, communication, PWA.
Release 3: LMS, assignments, library, transport, boarding.
Release 4: multi-campus, SSO, API ecosystem, advanced analytics.

## Architecture decisions
- Modular monolith before microservices.
- Supabase PostgreSQL is source of truth.
- No localStorage business database.
- Branding is data-driven.
- GitHub Pages is for frontend demos/testing, not the entire production backend.
