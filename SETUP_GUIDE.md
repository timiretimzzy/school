# Setup Guide

## Step 1: Supabase
Create a new Supabase project and record:
- Project URL
- Anonymous/publishable key

Do NOT expose service_role.

## Step 2: Database
Supabase Dashboard -> SQL Editor -> run `supabase/schema.sql`.

## Step 3: Super Admin
Create an Auth user, copy its UUID, then run:

```sql
insert into public.platform_admins (user_id, role)
values ('YOUR-USER-UUID', 'super_admin');
```

## Step 4: Local frontend
Copy `config.example.js` to `config.js` and add public Supabase values. `config.js` is gitignored.

## Step 5: GitHub Pages
Add repository secrets:
- SUPABASE_URL
- SUPABASE_ANON_KEY

Enable GitHub Pages using GitHub Actions.

## Things you must do manually
I cannot automatically:
1. Create/login to your Supabase account.
2. Create your GitHub repository.
3. Purchase domains.
4. Modify DNS at your registrar.
5. Configure payment accounts.
6. Send real emails/SMS without provider accounts.
7. legally approve privacy/contract documents.

## Production hosting recommendation
Frontend: Cloudflare Pages/Vercel
Database/Auth: Supabase
Privileged logic: Supabase Edge Functions
DNS/custom domains: Cloudflare or equivalent

GitHub Pages is suitable for testing the static frontend but cannot itself run secure private server code or dynamic backend jobs.

## Before paying customers
Complete:
- granular role RLS
- authentication flows
- invitations/password reset/MFA
- Storage security
- audit middleware
- backups/disaster recovery
- automated tests
- security review/penetration test
- privacy and retention policy
- monitoring
- CI/CD
- payment and messaging integrations
