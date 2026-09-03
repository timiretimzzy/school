# Security review

- [x] Tenant-owned tables carry `tenant_id` and have RLS enabled.
- [x] Frontend uses only the publishable/anon key (`js/supabaseClient.js`).
- [x] Privileged onboarding, invitations, and invitation acceptance use Edge
      Functions and a Supabase service-role secret (`supabase/functions/*`).
- [x] Tenant ID is authorized by database policies; it is not trusted from
      hidden UI controls.
- [x] Permission matrix separates school roles and finance access.
- [x] Teacher writes (attendance, assessments, marks) are additionally scoped
      to `teacher_assignments`, not just the generic role permission — see
      `supabase/migrations/004_teacher_scoped_permissions.sql`.
- [x] Parent/student access is linked through `student_links`,
      `parent_student_relationships`, and `is_linked_student`/
      `is_linked_parent`.
- [x] Students and parents can only read **published** assessment results;
      drafts are restricted to result managers.
- [x] Announcements are filtered by target audience and publish/expiry dates
      at the RLS layer, not just in the UI.
- [x] Results enforce maximum marks and restrict reads/writes.
- [ ] Storage buckets and signed URL policies exist (`002_storage.sql`) but
      no UI uploads documents yet.
- [ ] Production requires MFA, rate limits, email delivery, monitoring,
      backups, and an independent penetration test.

No service-role key or database password is present in the repository.
Rotate any credential that may have existed in prior external history.

## How to verify tenant/role isolation yourself

See `docs/TESTING.md`, "Test 6: Privacy — direct query denial", for the
exact queries to run as each role and the expected (empty/denied) result.
