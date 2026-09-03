# Testing

The database is the test boundary. Apply the migration, create two Auth users in Supabase, provision memberships in separate tenants, and run API queries using each user's session. A Tenant A user must receive no Tenant B rows even when a Tenant B UUID is supplied in filters. A teacher must receive no finance rows, a parent must receive only linked children, and a student must receive only linked/self results.

For local checks:

```sh
supabase start
supabase db reset
supabase functions serve create-tenant
```

Use the Supabase SQL editor or an authenticated client to verify denied operations. The final browser smoke test is: sign in as a platform admin, create a tenant through the function, confirm its branding/modules/audit row, then sign in as a school member and confirm platform navigation is unavailable.
