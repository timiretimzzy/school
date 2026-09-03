# Environment setup

The browser may contain only `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` (the legacy `SUPABASE_ANON_KEY` name is also accepted). Copy `config.example.js` to the gitignored `config.js` for local testing.

```sh
cp config.example.js config.js
```

Run migrations with the Supabase CLI after linking project `uvmgmbwnsdebtkwldfaa`. Never add `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SECRET_KEY`, `DATABASE_PASSWORD`, or direct database credentials to this repository. Edge Functions read `SUPABASE_SERVICE_ROLE_KEY` from Supabase secrets.

GitHub Pages requires repository secrets named `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`. Public publishable keys are not secrets; service-role keys must never be GitHub secrets used by the frontend.
