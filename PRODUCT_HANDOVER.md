# PRODUCT HANDOVER AND MASTER CONTEXT

## 1. Product identity

- **Owner:** FiscalStack Solutions
- **Category:** Multi-tenant, white-label school management, learning and operations platform
- **Current working platform name:** EduStack (working name only; customer-facing deployments may be completely white-labelled)
- **Important:** This is NOT CHS-ICS and must not contain Chibi High School or any other school's fixed identity.

## 2. Strategic vision

FiscalStack Solutions operates the infrastructure. Each subscribing school receives a personalised digital environment with its own branding and optionally its own domain. The school should feel that it owns its digital platform rather than appearing to use a vendor-branded application.

Core proposition:

> We do not ask a school to adopt someone else's brand. We provide infrastructure for the school to operate its own digital platform.

## 3. Current prototype status

The current repository is a static prototype intentionally designed for GitHub Pages testing.

Implemented:
- FiscalStack Solutions platform administration landing/dashboard
- Neutral platform with no hard-coded school identity
- School onboarding workflow
- School name configuration
- School motto configuration
- Proposed domain capture
- Primary, secondary and accent colour configuration
- Per-school module selection
- Tenant cards/dashboard
- Branded tenant portal preview
- Browser localStorage persistence
- Responsive CSS layout
- GitHub Pages compatibility (pure HTML/CSS/JavaScript)

The prototype proves the commercial onboarding and white-label concept. It is NOT yet a secure multi-tenant production application.

## 4. Product hierarchy

FiscalStack Solutions
  -> Platform Super Admin / Control Centre
    -> Tenant School
      -> School Administrator
        -> Head / Management
        -> Teachers
        -> Finance/Bursar
        -> Librarian
        -> Other authorised staff
        -> Parents/Guardians
        -> Students/Learners

## 5. Core product requirements

### A. FiscalStack Super Admin
- Create, suspend and archive schools
- Manage subscriptions and plans
- Configure domains and subdomains
- Configure branding
- Enable/disable modules
- View platform health
- Support access with audit logging
- Manage feature flags
- Monitor storage and usage
- Manage backups
- Manage platform-wide security settings

### B. Tenant / school configuration
- School identity
- Logo
- Favicon
- Motto
- Primary/secondary/accent colours
- Login branding
- Terminology configuration (student/learner/pupil, class/form/grade etc.)
- Academic year and term structure
- Grading systems
- Currency and regional settings
- Enabled modules

### C. Student Information System
- Admissions
- Student master profile
- Guardians and relationships
- Enrollment history
- Transfers and withdrawals
- Documents
- Medical/emergency information only where legally appropriate and securely protected
- Discipline and awards

### D. Academics
- Classes, streams and subjects
- Teacher assignment
- Attendance
- Assessments
- Continuous assessment
- Examinations
- Mark capture and bulk import
- Moderation
- Result approval and locking
- Report cards
- Transcripts
- Academic analytics
- Early intervention flags based on configurable patterns

### E. Finance
- Fee structures
- Invoices
- Payments
- Receipts
- Discounts
- Scholarships/bursaries
- Arrears
- Statements
- Payment plans
- Multi-currency where required
- Payment gateway integrations

### F. Parent portal
- Multiple children per account
- Attendance
- Results
- Reports
- Fees and statements
- Timetable
- Announcements
- Assignments
- School calendar

### G. Teacher workspace
- Assigned classes
- Daily timetable
- Attendance
- Assessments
- Mark entry
- Learning resources
- Assignments
- Student performance views

### H. Student portal
- Personal profile
- Personal attendance
- Personal results only
- Timetable
- Assignments
- Resources
- Announcements

### I. LMS
- Subject/topic resources
- PDFs, documents and videos
- Assignments
- Submissions
- Quizzes
- Teacher feedback
- Past papers
- Search

### J. Operational modules
Optional modules:
- Timetable management
- Library
- Transport
- Boarding/hostel
- HR
- Staff records
- Document management
- Communication

## 6. Non-negotiable privacy and security rule

A student must NEVER be able to access another student's marks, attendance, personal data or private records.

This must be enforced server-side through authentication, authorization and tenant-aware data queries. Hiding a button in the UI is not security.

## 7. Required production architecture

The recommended evolution is a modular monolith before considering microservices.

Suggested architecture:

Client Web/PWA
      |
REST/JSON API
      |
Application Backend
      |
Tenant Resolution Middleware
      |
Domain -> Tenant -> Branding -> Authentication -> Authorization
      |
PostgreSQL + Object Storage + Background Jobs
      |
SMS / Email / WhatsApp / Payment integrations

## 8. Multi-tenancy requirements

Every tenant-owned record must be isolated.

Minimum shared-database approach:

TENANTS
- id
- name
- slug
- status
- subscription_plan

TENANT_DOMAINS
- id
- tenant_id
- domain
- verified

TENANT_BRANDING
- tenant_id
- logo
- primary_color
- secondary_color
- accent_color
- favicon
- login_background

All tenant-owned records require `tenant_id`, and authorization must validate tenant context on every request.

Alternative enterprise option: database-per-tenant for customers requiring stronger isolation.

## 9. Domain strategy

Support both:

1. Platform subdomain
`school.platform-domain.example`

2. Custom domain
`portal.school.example`

Production flow:
Request -> Host header -> resolve verified domain -> identify tenant -> load branding/configuration -> authenticate -> authorize.

Custom domains require DNS verification and automated TLS certificates.

## 10. Branding engine

Branding should use tenant-specific CSS variables rather than separate frontend builds.

Example:
- `--primary-color`
- `--secondary-color`
- `--accent-color`

The same codebase should render differently for every school.

## 11. Modular product model

Schools should only receive modules they purchase or are entitled to use.

Examples:
- Core SIS
- Attendance
- Academics
- Finance
- Parent Portal
- LMS
- Library
- Transport
- Boarding
- HR

Module access should be controlled by tenant entitlements and feature flags, not manually forked codebases.

## 12. Release roadmap

### Release 0: Current GitHub Pages concept prototype
Status: Implemented

Focus:
- Product concept demonstration
- White-label onboarding
- Branding configuration
- Module selection
- Tenant preview

### Release 1: Commercial MVP
Priority: Highest

Build:
- Real backend API
- PostgreSQL
- Secure authentication
- FiscalStack Super Admin Control Centre
- Real tenant provisioning
- School administration
- Students
- Teachers
- Classes/subjects
- Attendance
- Assessments/results
- Announcements
- Audit logs
- Tenant-aware authorization
- Initial parent and student portals

### Release 2: Commercial operations
Build:
- Admissions
- Timetable
- Fees and billing
- PDF report cards
- Parent accounts
- Notifications
- PWA
- Bulk import/export
- Configurable grading

### Release 3: Learning and operations expansion
Build:
- Full LMS
- Assignments/submissions
- Quizzes
- Library
- Transport
- Boarding
- Advanced analytics

### Release 4: Platform scale
Build:
- Multi-campus
- API ecosystem
- SSO
- Advanced integrations
- Payment providers
- WhatsApp/SMS providers
- Enterprise tenant isolation
- Data warehouse/reporting
- Advanced AI-assisted analytics where genuinely useful

## 13. Production technology recommendation

The static prototype can remain HTML/CSS/JavaScript.

Production recommendation:
- Frontend: React/Next.js or equivalent mature component architecture
- Backend: .NET, Django, FastAPI, or another strongly structured backend selected deliberately
- Database: PostgreSQL
- Cache/queues: Redis
- Object storage: S3-compatible storage
- Containerisation: Docker
- CI/CD: GitHub Actions
- Hosting: cloud infrastructure with managed database

Avoid premature microservices. Start with a modular monolith with clean module boundaries.

## 14. GitHub Pages limitation

GitHub Pages is suitable for this prototype and static demonstrations.

It cannot safely provide:
- production authentication
- secure secrets
- PostgreSQL
- server-side authorization
- real tenant isolation
- payment processing
- protected file storage

Therefore GitHub Pages is for testing the UX/product concept only. Production requires a backend deployment.

## 15. Definition of success

A product administrator should be able to:

1. Log into the FiscalStack Control Centre.
2. Create a new school.
3. Upload its identity assets.
4. Choose its colours and terminology.
5. Enable modules based on its subscription.
6. Configure a platform subdomain or custom domain.
7. Create the first school administrator.
8. Provision an isolated tenant environment.
9. Allow the school to manage its own users and data.
10. Maintain the tenant centrally without exposing FiscalStack administrative controls to the school.

## 16. Design principles for future agents

Any future implementation must preserve these principles:

- No fixed school identity in the core product.
- FiscalStack Solutions owns and operates the infrastructure.
- Customer-facing deployments are white-label.
- Multi-tenancy is a core architecture feature, not an afterthought.
- Tenant isolation is enforced server-side.
- Role-based access is mandatory.
- Modules are configurable per tenant.
- Branding is configuration-driven.
- Custom domains are supported.
- Mobile responsiveness is required.
- Zimbabwe should be supported well, but architecture should remain internationally adaptable.
- Never create separate code forks for individual schools unless there is an exceptional contractual reason.
- Prefer configuration over custom code.
- Build a modular monolith before introducing microservices.

## 17. Immediate next development task

Replace browser-only localStorage with a real application foundation and implement, in order:

1. Authentication and user management
2. Tenant model and domain resolution
3. Super Admin Control Centre
4. Tenant onboarding/provisioning
5. School branding engine
6. Role and permission system
7. Student Information System
8. Academic management
9. Attendance
10. Results and report generation
11. Audit logging

Only after these foundations are reliable should optional modules be expanded aggressively.
