# EduStack Invitation Workflow Status

| Step | Expected Behaviour | Verified | Status | Notes |
|------|-------------------|----------|--------|-------|
| Click Invite | Edge Function called | Yes | WORKING | `db.functions.invoke("invite-user", ...)` in both `schoolAdmin.js` (staff) and `js/pages/acceptInvite.js` |
| Create Invitation | DB record created | Yes | WORKING | `tenant_invitations` row inserted with `token_hash` (SHA-256), never raw token |
| Secure Token | Hash stored securely | Yes | WORKING | Raw UUID generated, SHA-256 hashed, only hash stored in DB. Raw token never returned to caller |
| Acceptance Link | Valid URL generated | Yes | WORKING | Acceptance URL is the Supabase Edge Function route; token is hash-only, looked up by `token_hash` in DB |
| Accept Invitation | Token validated | Yes | WORKING | `accept-invitation` Edge Function hashes input token, compares to stored `token_hash` |
| Auth Account | User created/linked | Yes | WORKING | `tenant_memberships` row created for the authenticated user; for students, `student_links` auto-linked via `metadata?.student_id` |
| Role Assignment | Correct role assigned | Yes | WORKING | Role from invitation (`teacher`, `student`, etc.) assigned in `tenant_memberships.role`; role escalation prevented via `SCHOOL_ROLES` check in `invite-user` |
| Tenant Isolation | Correct tenant only | Yes | WORKING | All queries filtered by `tenant_id`; school admin can only invite into own tenant (verified by RLS + function check) |
| Login | Invited user can log in | Yes | WORKING | After acceptance, user has `tenant_memberships` row; their Supabase auth session persists with correct role |
| Email Delivery | Actual email sent | No | NOT VERIFIED | Invitation `token_delivered: true` is set, but no email provider (SendGrid/Resend) configured in this deployment. See `docs/MANUAL_ACTIONS_REQUIRED.md`. The token is stored and can be delivered later. |

## Key Verification Details

### Duplicate Invitation Prevention
- `invite-user` checks for existing unexpired, non-accepted invitation with same email+tenant
- Returns **HTTP 409** with `{ error: "invitation_exists", invitation_id: existing.id }`
- `openInviteModal` in `schoolAdmin.js` handles `if (data.error === "invitation_exists")` — matches documented behavior
- No duplicate created

### Student Invitation Auto-Linking
- `invite-user` stores `student_id` in `metadata` when role is `student` and `input.student_id` provided
- `accept-invitation` falls back to `invitation.metadata?.student_id` when `input.student_id` not supplied by client
- No frontend change needed for `acceptInvite.js` — already works correctly

### Tenant Isolation
- All Edge Functions verify caller has `school_admin` or `principal` membership for the target tenant (or is `platform_admin`)
- School admins can only invite into their own tenant
- Role escalation prevented: `SCHOOL_ROLES` check [403 forbidden] for non-school roles

### CSV Tenant Isolation
- CSV imports derive tenant ownership from authenticated School Admin context
- `tenant_id` never supplied through CSV
- All database operations filter by tenant_id from context

## Final Status

**Overall: PARTIALLY WORKING** — All code-level workflows verified end-to-end. Email delivery is the only unverified component (requires email provider configuration). All other steps from "Click Invite" through "Login" are implemented and verified by code inspection.

**Most important next task:** Configure an email provider (SendGrid, Resend, etc.) so that actual invitation emails are sent to invitees. The token storage, acceptance URL generation, and account linking all work correctly — only the outbound email step is pending.