# EduStack Platform

Commercial multi-tenant, white-label school operating system by FiscalStack Solutions.

## Architecture
Static frontend (GitHub Pages compatible) + Supabase Auth/PostgreSQL/RLS.

## Start
1. Create Supabase project.
2. Link the project and run `supabase db push` to apply `supabase/migrations`.
3. Copy `config.example.js` to `config.js` for local testing.
4. Add `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` as GitHub secrets for Pages deployment.
5. Read `docs/ENVIRONMENT_SETUP.md`, `docs/SETUP_AND_TESTING.md`, and `docs/PRODUCT_HANDOVER.md`.

No localStorage is used as the application database. Platform mutations are authorized Edge Function calls; PostgreSQL RLS is the tenant isolation boundary.
