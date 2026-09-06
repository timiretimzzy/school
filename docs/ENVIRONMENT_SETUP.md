# Environment setup

This app needs a browser config file at `config.js` that defines `window.EDUSTACK_CONFIG` with:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY` (legacy `SUPABASE_ANON_KEY` is also accepted)

For local testing, copy `config.example.js` to `config.js` and replace the placeholder values:

```sh
cp config.example.js config.js
```

Use these project values:

- Project ref: `uvmgmbwnsdebtkwldfaa`
- Supabase URL: `https://uvmgmbwnsdebtkwldfaa.supabase.co`

Do **not** commit `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SECRET_KEY`, `DATABASE_PASSWORD`, or any direct database credentials to this repository. Edge Functions should read `SUPABASE_SERVICE_ROLE_KEY` from Supabase secrets.

GitHub Pages should use repository secrets named `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`. Public publishable keys are not secret; service-role keys must stay out of the frontend.

CLI note: the Supabase CLI needs a **Supabase access token** for `supabase link` / `supabase db push`, which is different from the project’s service-role key.
