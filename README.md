# EduStack Platform

Commercial multi-tenant, white-label school operating system by FiscalStack Solutions.

## Architecture
Static frontend (GitHub Pages compatible) + Supabase Auth/PostgreSQL/RLS.

## Start
1. Create Supabase project.
2. Run `supabase/schema.sql`.
3. Copy `config.example.js` to `config.js` for local testing.
4. Add `SUPABASE_URL` and `SUPABASE_ANON_KEY` as GitHub secrets for Pages deployment.
5. Read `PRODUCT_MASTER.md` and `SETUP_GUIDE.md`.

No localStorage is used as the application database.
