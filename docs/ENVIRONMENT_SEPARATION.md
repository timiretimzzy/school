# Environment Separation Guide

## Environments

| Environment | Purpose | Supabase Project | Frontend |
|-------------|---------|-------------------|----------|
| **Development** | Local development | `uvmgmbwnsdebtkwldfaa` (shared) | `localhost:8080` |
| **Staging** | Pre-production testing | Create new project | Vercel preview |
| **Production** | Live customers | Create new project | GitHub Pages |

## Setting Up a New Environment

### 1. Create Supabase Project
1. Go to https://supabase.com/dashboard → New Project
2. Note the project ref, URL, and keys

### 2. Run Migrations
```bash
supabase link --project-ref <new-project-ref>
supabase db push
```

### 3. Deploy Edge Functions
```bash
export SUPABASE_ACCESS_TOKEN="<your-token>"
for fn in login-with-login-id change-password create-account invite-user accept-invitation create-tenant send-invitation-email resolve-domain health-check; do
  supabase functions deploy $fn --project-ref <new-project-ref>
done
```

### 4. Set Edge Function Secrets
```bash
supabase secrets set RESEND_API_KEY=<key> FROM_EMAIL=noreply@edustack.app SITE_URL=<url> ENVIRONMENT=<env> --project-ref <new-project-ref>
```

### 5. Update Frontend Config
- **Development:** `config.js` with dev project keys
- **Staging:** GitHub Actions secrets for staging project
- **Production:** GitHub Actions secrets for production project

### 6. Seed Demo Data (Dev/Staging only)
```bash
psql $DATABASE_URL -f supabase/seed.sql
```

## Environment Variables Reference

| Variable | Where | Description |
|----------|-------|-------------|
| `SUPABASE_URL` | GitHub Actions secrets | Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | GitHub Actions secrets | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Function secrets | Service role key |
| `RESEND_API_KEY` | Edge Function secrets | Email API key |
| `FROM_EMAIL` | Edge Function secrets | Sender email address |
| `SITE_URL` | Edge Function secrets | Frontend URL for links |
| `ENVIRONMENT` | Edge Function secrets | `development`, `test`, or `production` |

## Promotion Workflow

```
Dev (local) → Staging (Vercel) → Production (GitHub Pages)
     ↓              ↓                    ↓
  supabase db    supabase db         supabase db
    push           push                push
```

1. Code changes are tested locally
2. Push to `main` → triggers staging deploy (Vercel)
3. Verify on staging
4. Tag a release → triggers production deploy (GitHub Pages)
5. Run migrations on production Supabase project
6. Deploy Edge Functions to production
