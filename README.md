# EduStack Platform

Commercial multi-tenant, white-label school operating system by FiscalStack
Solutions. This is a static frontend (GitHub Pages compatible) backed by
Supabase Auth/PostgreSQL/RLS and a small number of authenticated Edge
Functions for privileged operations.

## What actually works today

- **Platform admin**: real dashboard metrics, school search, school detail
  view, edit/suspend/activate, subscription status, and a 5-step onboarding
  wizard that creates a tenant through the `create-tenant` Edge Function
  (tenant, branding, modules, audit log, and an initial admin invitation).
- **School admin**: real dashboard metrics, academic setup (years, terms,
  classes, subjects, teacher assignments, student enrolments), student CRUD
  and profile view, staff CRUD, and announcements.
- **Teacher workspace**: assigned classes/subjects only, attendance marking
  restricted to assigned classes, assessment creation and mark entry
  restricted to assigned class/subject, draft/publish workflow.
- **Student portal**: own profile, attendance summary, published results
  only, announcements targeted at students.
- **Parent portal**: linked children only, their attendance and published
  results, announcements targeted at parents.
- **White-label branding**: tenant colours/logo are fetched and applied as
  CSS custom properties and sidebar/header content on every sign-in.
- **Invitation acceptance**: the `accept-invitation` Edge Function turns a
  pending `tenant_invitations` row into an active membership (and, for
  students/parents, the corresponding link/profile rows).

See `docs/DEMO_CREDENTIALS.md` for a reproducible way to stand up a demo
tenant and users, and `docs/TESTING.md` for the acceptance test plan
(including the required RLS privacy checks).

## Architecture

Static frontend (plain HTML/CSS/ES modules, no build step) + Supabase
Auth/PostgreSQL/RLS. `app.js` is the entry point; `js/pages/*.js` render each
role's workspace. No localStorage is used as the application database.
Platform/tenant mutations that need elevated privileges go through
authenticated Edge Functions (`supabase/functions/*`); PostgreSQL RLS
(`supabase/migrations/*.sql`) is the tenant/role isolation boundary.

## Deploy and run it yourself

```sh
git clone <this-repo-url>
cd school

# 1. Create/link your Supabase project
supabase login
supabase link --project-ref <your-project-ref>

# 2. Apply the database schema (RLS included)
supabase db push

# 3. Deploy the Edge Functions
supabase functions deploy create-tenant
supabase functions deploy invite-user
supabase functions deploy accept-invitation

# 4. Local frontend config (gitignored)
cp config.example.js config.js
# edit config.js with your project's URL + publishable key

# 5. Serve the static frontend locally
python3 -m http.server 8080
```

For GitHub Pages, add repository secrets `SUPABASE_URL` and
`SUPABASE_PUBLISHABLE_KEY`; `.github/workflows/pages.yml` writes them into
`config.js` at deploy time and publishes the repository root. See
`docs/DEPLOYMENT.md`, `docs/ENVIRONMENT_SETUP.md`, and
`docs/DEMO_CREDENTIALS.md` for full details, and `docs/ROADMAP.md` /
`docs/TECHNICAL_AUDIT.md` for known limitations.
