# Deployment

## Authoritative command sequence

```sh
git clone <this-repo-url>
cd school

supabase login
supabase link --project-ref <your-project-ref>
supabase db push
supabase functions deploy create-tenant
supabase functions deploy invite-user
supabase functions deploy accept-invitation
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

cp config.example.js config.js   # edit with your public Supabase URL/key
```

Then either serve `config.js` + the repository root locally
(`python3 -m http.server 8080`), or push to `main` with `SUPABASE_URL` and
`SUPABASE_PUBLISHABLE_KEY` set as GitHub repository secrets so
`.github/workflows/pages.yml` can generate `config.js` and publish to GitHub
Pages automatically.

## What GitHub Pages does and does not provide

GitHub Pages deploys the static frontend from `main` and injects only the
public Supabase configuration (see the workflow's "Create public config"
step). It is a plain static file host: it cannot run server-side code, keep
secrets beyond what is embedded in public files, or resolve custom tenant
hostnames to a tenant record. Link the Supabase project, apply migrations,
deploy Edge Functions, and set `SUPABASE_SERVICE_ROLE_KEY` with
`supabase secrets set` — never in a GitHub secret consumed by the frontend
build.

For production white-label custom domains, put Cloudflare (or an
equivalent) in front of the frontend with wildcard/custom-domain routing.
Resolve the verified hostname to a tenant, then load that tenant's branding
before rendering (not yet implemented; the current frontend uses a
context switcher instead — see `docs/ROADMAP.md`).
