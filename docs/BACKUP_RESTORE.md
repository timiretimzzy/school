# Database Backup & Restore Guide

## Automated Backups (Supabase Dashboard)

1. Go to https://supabase.com/dashboard/project/uvmgmbwnsdebtkwldfaa/settings/backup
2. Enable **Point-in-time Recovery (PITR)** — requires Pro plan ($25/month)
3. Set backup interval to 6 hours (minimum for Pro)

## Manual Backup via pg_dump

```bash
# Set connection string (from Supabase Dashboard → Settings → Database → Connection string → URI)
export DATABASE_URL="postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres"

# Full backup
pg_dump "$DATABASE_URL" -F c -f backup_$(date +%Y%m%d_%H%M%S).dump

# Schema only (no data)
pg_dump "$DATABASE_URL" -s -f schema_$(date +%Y%m%d).sql

# Data only
pg_dump "$DATABASE_URL" -a -f data_$(date +%Y%m%d).sql
```

## Restore

```bash
# From backup file
pg_restore "$DATABASE_URL" -d postgres -c backup_20260909_120000.dump

# From SQL file
psql "$DATABASE_URL" -f schema_20260909.sql
```

## What to Back Up

| Component | Method | Frequency |
|-----------|--------|-----------|
| Database | pg_dump / PITR | Every 6 hours |
| Edge Functions | `supabase functions deploy` (source in git) | On each deploy |
| Storage | Supabase Dashboard → Storage → Download | Weekly |
| Config | `config.js` + GitHub Actions secrets | On change |

## Restore Procedure

1. Create a new Supabase project (if restoring to a different instance)
2. Run all migrations in order: `001` through `009`
3. Restore from pg_dump backup
4. Redeploy all Edge Functions
5. Update `config.js` and GitHub Actions secrets with new project credentials
6. Verify with `node security-regression-test.js`
