# Setup guide

## Step 1: Supabase project

Create a Supabase project and record the project URL and the
publishable/anon key. Never expose the service-role key in the frontend or
in this repository.

## Step 2: Database schema

```sh
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

This applies every file in `supabase/migrations/` in order (see
`docs/DATABASE_SCHEMA.md`).

## Step 3: Edge Functions

```sh
supabase functions deploy create-tenant
supabase functions deploy invite-user
supabase functions deploy accept-invitation
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

## Step 4: First platform administrator

Create an Auth user (Dashboard → Authentication → Users), copy its UUID,
then run in the SQL editor:

```sql
insert into public.platform_admins (user_id, role)
values ('YOUR-USER-UUID', 'super_admin');
```

## Step 5: Local frontend

```sh
cp config.example.js config.js
# edit config.js with your SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY
python3 -m http.server 8080
```

`config.js` is gitignored; it is never committed.

## Step 6: GitHub Pages

Add repository secrets `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`. Enable
GitHub Pages with the "GitHub Actions" source; `.github/workflows/pages.yml`
writes `config.js` at deploy time and publishes the repository root.

## Step 7: Demo data (optional, for sales demos)

Follow `docs/DEMO_CREDENTIALS.md` to seed a fictional "Demo High School"
tenant and create the demo Auth users for every role.

## Things that cannot be automated from this repository

1. Creating/logging into your Supabase account.
2. Creating your GitHub repository or purchasing domains.
3. Modifying DNS at your registrar.
4. Configuring payment accounts.
5. Sending real emails/SMS without a provider account (invitations currently
   surface a one-time token that must be relayed manually — see
   `docs/DEMO_CREDENTIALS.md`).
6. Legally approving privacy/contract documents.

## Production hosting recommendation

Frontend: GitHub Pages, Cloudflare Pages, or Vercel. Database/Auth:
Supabase. Privileged logic: Supabase Edge Functions. DNS/custom domains:
Cloudflare or equivalent. GitHub Pages is suitable for testing and demoing
the static frontend but cannot itself resolve custom tenant hostnames or run
private server code — see `docs/DEPLOYMENT.md`.

## Before onboarding paying customers

See `docs/ROADMAP.md` for the current list of gaps (production hostname
resolution, transactional email, automated test suite, MFA, monitoring,
backups/disaster recovery, and an independent security review).
