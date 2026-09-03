# Deployment

GitHub Pages deploys the static frontend from `main` and injects only the public Supabase configuration. Link the Supabase project, apply migrations, deploy functions, and set `SUPABASE_SERVICE_ROLE_KEY` with `supabase secrets set`. Configure Auth redirect URLs for the Pages origin.

For production white-label domains, put Cloudflare (or equivalent) in front of the frontend with wildcard/custom-domain routing. Resolve the verified hostname to a tenant, then load branding before rendering. GitHub Pages alone cannot provide server-side routing, private secrets, protected files, or a production backend.
