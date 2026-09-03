# Technical audit

## Current state

EduStack is a static HTML/CSS/JavaScript GitHub Pages prototype. It has a Supabase client integration point, a tenant list, and a school onboarding form. The original schema covered tenants, branding, memberships, academics, students, attendance, results, finance, announcements, and audit logs.

## Findings

- **Works:** responsive shell, neutral FiscalStack platform presentation, publishable-key configuration, basic tenant list and branding fields.
- **Partial:** authentication was not required; tenant selection and platform authorization were absent; onboarding used a direct browser insert; domain resolution, invitations, storage, and real school workspaces were absent.
- **Fake/demo:** the prototype's localStorage persistence described in older handover text is not present in the current code, and the onboarding UI previously implied functionality it could not securely perform.
- **Security risks:** broad tenant-member `FOR ALL` policies allowed every member to write every module; students and parents were not linked to records; results were visible to all tenant members; platform-admin checks were not applied to frontend onboarding; errors exposed database messages.
- **Missing controls:** granular permissions, teacher assignments, parent/student links, invitation lifecycle, terms/forms/staff entities, storage policies, and edge-function authorization.

## Recommended architecture

Use Supabase Auth with a shared PostgreSQL database. Every tenant-owned table carries `tenant_id`; RLS and narrowly scoped `SECURITY DEFINER` helper functions are the isolation boundary. Platform operations run through authenticated Edge Functions using the service-role secret stored only in Supabase. The static client uses only the publishable/anon key. Resolve a tenant from a verified hostname in production, with slug/query selection only for development. Expand the modular monolith only after the MVP security and test suite is established.
