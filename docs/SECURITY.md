# Security review

- [x] Tenant-owned tables carry `tenant_id` and have RLS enabled.
- [x] Frontend uses only the publishable/anon key.
- [x] Privileged onboarding and invitations use Edge Functions and a Supabase service-role secret.
- [x] Tenant ID is authorized by database policies; it is not trusted from hidden UI controls.
- [x] Permission matrix separates school roles and finance access.
- [x] Parent/student access is linked through `student_links` and `is_linked_student`.
- [x] Results enforce maximum marks and restrict reads.
- [ ] Storage buckets and signed URL policies must be applied in the next migration before document uploads.
- [ ] Production requires MFA, rate limits, email delivery, monitoring, backups, and an independent penetration test.

No service-role key or database password is present in the repository. Rotate any credential that may have existed in prior external history.
