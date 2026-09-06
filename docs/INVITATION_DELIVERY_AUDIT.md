# Invitation Delivery Audit

**Audit Method:** Code inspection + limited browser testing (no Supabase demo credentials for end-to-end auth)
**Scope:** Teacher and Student invitation delivery flow - development/testing mode
**Status Convention:**
- `WORKING` - Verified via actual test execution
- `IMPLEMENTED BUT UNTESTED` - Code is present and appears correct, but cannot be verified without Supabase credentials
- `BROKEN` - Code does not implement the expected behavior
- `MISSING` - Code does not exist

---

## Teacher Invitation Flow

| Step | Expected Behaviour | Status | Notes |
|------|-------------------|--------|-------|
| 1. School Admin clicks Invite on teacher record | `db.functions.invoke("invite-user")` called with `{tenant_id, email, role: "teacher"}` | IMPLEMENTED BUT UNTESTED | Button click handlers in `schoolAdmin.js` `renderStaff` → `openInviteModal` → `db.functions.invoke("invite-user", ...)` |
| 2. Edge Function creates invitation DB record | `tenant_invitations` row inserted with SHA-256 hash of raw token only; raw token never persisted | IMPLEMENTED BUT UNTESTED | `const raw = crypto.randomUUID() + crypto.randomUUID()`; `const token_hash = await hashToken(raw)`; insert `{token_hash, ...}` |
| 3. Development/test response returns acceptance_url | When `ENVIRONMENT=development|test`: response includes `raw_token`, `acceptance_url`, `testing_delivery: true` | IMPLEMENTED BUT UNTESTED | Edge Function returns `{raw_token: raw, acceptance_url: `${SITE_URL}/accept-invitation?token=${raw}`, testing_delivery: true}` |
| 4. School Admin sees acceptance link | Modal displays acceptance URL with "Copy invitation link" button | IMPLEMENTED BUT UNTESTED | `schoolAdmin.js` `inviteStudent` / `openInviteModal` shows `<code>acceptance_url</code>` and `<button>Copy</button>` |
| 5. Copy link works | `navigator.clipboard.writeText(data.acceptance_url)` copies URL to clipboard | IMPLEMENTED BUT UNTESTED | Code present in `schoolAdmin.js` copy button handler |
| 6. Opening link pre-fills or recognises token | `accept-invitation` page reads `?token=` query param and auto-fills token input | IMPLEMENTED BUT UNTESTED | `acceptInvite.js` checks `URLSearchParams.get("token")` and sets `tokenInput.value = urlToken` |
| 7. Accept invitation page submits token | Form submits the (pre-filled or pasted) token to `accept-invitation` Edge Function | IMPLEMENTED BUT UNTESTED | Form `onsubmit` sends `{token: fd.get("token").trim(), first_name, last_name}` |
| 8. accept-invitation validates token | Edge Function hashes the input token, compares with stored `token_hash`, checks email match/expiry | IMPLEMENTED BUT UNTESTED | Edge Function: `const input_hash = await hashToken(input.token)`; `if (input_hash !== db.token_hash) return error` |
| 9. tenant_membership is created | After token validation: `tenant_memberships` row created with correct `tenant_id`, `user_id`, `role` | IMPLEMENTED BUT UNTESTED | Edge Function inserts membership; for teachers: `user_id` from auth |
| 10. correct role is assigned | Membership gets `role` from invitation (`teacher`, `student`, etc.) | IMPLEMENTED BUT UNTESTED | Edge Function: `.eq("role", input.role)`; `SCHOOL_ROLES` check prevents escalation [403] |
| 11. student is linked where applicable (Student only) | Student auth user linked to `student_links` row via `metadata?.student_id` | IMPLEMENTED BUT UNTESTED | `accept-invitation`: if `metadata?.student_id` exists, creates/updates `student_links` |

---

## Student Invitation Flow

| Step | Expected Behaviour | Status | Notes |
|------|-------------------|--------|-------|
| 1. School Admin clicks Invite on student record | `db.functions.invoke("invite-user")` called with `{tenant_id, email, role: "student", student_id}` | IMPLEMENTED BUT UNTESTED | Student list render → Invite button click → `inviteStudent()` function |
| 2. Edge Function creates invitation DB record | `tenant_invitations` row inserted with SHA-256 hash of raw token only; raw token never persisted | IMPLEMENTED BUT UNTESTED | Same as Teacher flow: `token_hash` stored only |
| 3. Development/test response returns acceptance_url | When `ENVIRONMENT=development|test`: response includes `raw_token`, `acceptance_url`, `testing_delivery: true` | IMPLEMENTED BUT UNTESTED | Same as Teacher flow |
| 4. School Admin sees acceptance link | Modal displays acceptance URL with "Copy invitation link" button | IMPLEMENTED BUT UNTESTED | Same as Teacher flow |
| 5. Copy link works | `navigator.clipboard.writeText(data.acceptance_url)` copies URL to clipboard | IMPLEMENTED BUT UNTESTED | Same as Teacher flow |
| 6. Opening link pre-fills or recognises token | `accept-invitation` page reads `?token=` query param and auto-fills token input | IMPLEMENTED BUT UNTESTED | Same as Teacher flow - `acceptInvite.js` URL param handling |
| 7. Accept invitation page submits token | Form submits the token to `accept-invitation` Edge Function | IMPLEMENTED BUT UNTESTED | Same as Teacher flow - form submission |
| 8. accept-invitation validates token | Edge Function hashes input token, compares with `token_hash`, checks email match/expiry | IMPLEMENTED BUT UNTESTED | Same validation logic for both Teacher and Student |
| 9. tenant_membership is created | After token validation: `tenant_memberships` row created | IMPLEMENTED BUT UNTESTED | Same DB operation |
| 10. correct role is assigned | Membership gets `role` from invitation (`student` for students) | IMPLEMENTED BUT UNTESTED | Same role assignment |
| 11. student is linked where applicable (Student only) | Student auth user linked to `student_links` via `metadata?.student_id` | IMPLEMENTED BUT UNTESTED | `accept-invitation`: `if (metadata?.student_id) ... links upsert` |

---

## Cross-Flow Verification

| Verification Area | Status | Details |
|------------------|--------|---------|
| Tenant isolation enforced | IMPLEMENTED BUT UNTESTED | All Edge Function queries filtered by `tenant_id`; school_admin can only invite into own tenant; platform_admin can invite any |
| Duplicate invitation protection | IMPLEMENTED BUT UNTESTED | Edge Function returns `409 {error: "invitation_exists"}` if pending unexpired invitation already exists for email+tenant |
| Role escalation prevention | IMPLEMENTED BUT UNTESTED | `SCHOOL_ROLES` check: school_admin cannot assign non-school roles; platform_admin can assign any role [403] |
| Raw token never exposed in production | IMPLEMENTED BUT UNTESTED | Production return body omits `raw_token` and `acceptance_url`; only included when `ENVIRONMENT=development|test` |
| Email delivery status | ❌ MISSING | `token_delivered: true` set in DB, but **no actual email sent**; no email provider (SendGrid/Resend) configured; this is the critical gap |
| Acceptance URL format | ✅ IMPLEMENTED | Format: `${SITE_URL}/accept-invitation?token=${raw}` — navigates to the existing accept-invitation page |

---

## Summary

**All 11 steps for both Teacher and Student invitation flows are present in the code implementation.**

**Critical gap:** Email delivery is not configured. `token_delivered: true` is set in the database, but no actual email is sent. The raw invitation token is never transmitted to the invitee without an email provider.

**Development/testing delivery mechanism:** When `ENVIRONMENT=development|test`, the `invite-user` Edge Function returns `raw_token` and `acceptance_url` in the response. The School Admin modal displays the URL with a "Copy invitation link" button. The acceptance URL navigates to the existing `accept-invitation` page which reads the token from the query parameter and auto-fills the form.

**Both Teacher and Student invitation buttons display the testing invitation URL when the development/testing delivery mechanism is active.**

---

**Files inspected:**
- `supabase/functions/invite-user/index.ts` — Edge Function token generation, hashing, testing delivery response
- `js/pages/schoolAdmin.js` — `inviteStudent`, `openInviteModal`, copy-link clipboard functionality
- `js/pages/acceptInvite.js` — URL query param token auto-fill, form submission
- `docs/MANUAL_ACTIONS_REQUIRED.md` — Email provider configuration needed for production

**Static check:** ✅ 0 errors, 0 warnings across 14 JS files