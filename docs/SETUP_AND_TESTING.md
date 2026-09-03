# Setup and testing

1. Create/link the Supabase project and apply `supabase/migrations`.
2. Create a Supabase Auth user and insert its UUID into `platform_admins` using the SQL editor.
3. Copy `config.example.js` to `config.js`, then serve the repository over HTTP.
4. Sign in through the configured Auth flow and exercise platform onboarding.
5. Create test users in two tenants and verify RLS isolation and role restrictions as described in `TESTING.md`.

Email invitations require an email provider in production. For development, inspect the invitation row and use a local test mailer; never expose raw invitation tokens in logs or database responses.
