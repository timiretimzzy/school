// Single Supabase client instance shared across the whole SPA. The publishable
// key is safe for the browser; every privileged mutation goes through an
// authenticated Edge Function or is authorized by PostgreSQL RLS.
const config = window.EDUSTACK_CONFIG || {};

export const isConfigured = Boolean(
  config.SUPABASE_URL && !config.SUPABASE_URL.includes("YOUR_PROJECT"),
);

export const db = isConfigured
  ? window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY || config.SUPABASE_ANON_KEY)
  : null;
