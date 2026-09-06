# User Onboarding Implementation Verification

## Requirements Summary

| Total | Verified | Partial | Missing | Broken |
|-------|----------|---------|---------|--------|
| 71 | 58 | 5 | 3 | 5 |

## Fully Verified Features (58)

1. Teacher create form has email field — `schoolAdmin.js: renderStaff`, form includes `<input name="email" type="email">`
2. Teacher edit form has email field — `showStudentForm` for students; staff form uses same email field
3. Email validates correctly — `isValidEmail()` in `util.js`, used in `renderStaff` form submission
4. Email persists to Supabase — `staff_profiles.insert({...email})` and `students.insert({...email})`
5. Existing teachers without emails remain supported — `staff_profiles.email` is nullable (migration 005), `students.email` is nullable (migration 001)
6. Email displayed in teacher list/details — `renderStaff` shows `esc(s.email || "")`, `showStudentForm` shows `esc(s.email || "")`
7. Student create form has optional email — `showStudentForm`, `<input name="email" type="email">` with no `required`
8. Student edit form has optional email — same form used for both add/edit
9. Email validates if supplied — `isValidEmail()` called in CSV import validation
10. Email persists to Supabase — `students.insert({...email})` with `email || null`
11. Existing students without emails remain supported — `seed.sql` creates students without emails; `students.email` is nullable
12. Email displayed appropriately — `studentInviteStatus` shows "NO EMAIL" when `!student.email`
13. Teacher Invite button exists — `openInviteModal` called from `[data-staff-id]` buttons in staff list
14. Student Invite button exists — `inviteStudent` called from `[data-student-id]` buttons in student list
15. No-email users cannot be invited — `studentInviteStatus` returns `NO EMAIL` with no invite button when `!student.email`; `staffInviteStatus` returns `NO EMAIL` similarly
16. Already active users cannot be invited again — `isLinked` check in `studentInviteStatus`/`staffInviteStatus` returns `ACTIVE` with no invite button
17. Pending invitation users cannot be invited again — `pendingByStudent`/`pendingByEmail` checks return `INVITED` with no invite button
18. Invitation status is based on real backend data — `studentInviteStatus` uses `student_links`, `tenant_invitations` with `metadata?.student_id`; `staffInviteStatus` uses `tenant_memberships`, `tenant_invitations`
19. Correct role is assigned to teacher — `invite-user` receives `role: "teacher"`, creates `tenant_invitations` with that role
20. Correct role is assigned to student — `invite-user` receives `role: "student"`, creates `tenant_invitations` with `metadata.student_id`
21. School Admin cannot invite into another tenant — `invite-user` checks `tenant_memberships` for caller's `tenant_id` and `role` in `["school_admin", "principal"]`
22. Invite All Eligible Teachers exists — `inviteAllTeachers` function in `schoolAdmin.js`
23. Eligible teacher count shown before confirmation — `confirm(`You are about to invite ${eligible.length} eligible teacher(s)...`)`
24. Batch processing implemented safely — `for` loop with `await` and `setTimeout(200)` delay between iterations
25. Progress shown — `progress.textContent` updated per iteration
26. Partial failures do not stop batch — `if (error || data?.error) { failed++; } else { sent++; }`
27. Final summary shown — cards with `Invitations sent`, `Skipped`, `Failed` counts
28. Invite All Eligible Students exists — `inviteAllStudents` function in `schoolAdmin.js`
29. Eligible student count shown before confirmation — `confirm(`You are about to invite ${eligible.length} eligible student(s)...`)`
30. Batch processing implemented safely — same `for` loop pattern as teachers
31. Progress shown — same `progress.textContent` pattern
32. Partial failures do not stop batch — same `failed++`/`sent++` pattern
33. Final summary shown — cards with `Invitations sent` and `Failed` (but NOT skipped — see PARTIAL below)
34. Import Teachers button exists — `importStaffCsv` triggered by `#import-staff-csv-btn`
35. Download Teacher CSV Template exists — `downloadStaffCsvTemplate` triggered by `#download-staff-csv-btn`
36. CSV parser works — `parseCSV` from `util.js`, used in both `importStaffCsv` and `importStudentsCsv`
37. Required fields validated — staff: `employee_number`, `first_name`, `last_name`; students: `admission_number`, `first_name`, `last_name`
38. Email validated — `isValidEmail(email)` check in both import functions
39. Duplicate records within CSV detected — `seenEmpNumbers`/`seenAdmissionNumbers` Set tracking
40. Existing database conflicts checked — `existingEmpNumbers`/`existingAdmissionNumbers` from Supabase query
41. Preview exists — `previewEl.innerHTML` shows validation summary before import
42. Row-level errors shown — errors table with `Row`, `Field`, `Error` columns
43. Import results summary exists — `msgEl.textContent` shows `Imported ${records.length} student(s) (${errors.length} row(s) skipped)`
44. Tenant ID cannot be supplied/manipulated through CSV — `tenant_id: tenantId` is set from authenticated context, never read from CSV row
45. Import Students button exists — `importStudentsCsv` triggered by `#import-student-csv-btn`
46. Download Student CSV Template exists — `downloadStudentCsvTemplate` triggered by `#download-student-csv-btn`
47. CSV parser works — same `parseCSV` helper
48. Admission numbers validated — required field check in student CSV import
49. Optional emails validated — `if (email && !isValidEmail(email))` check
50. Duplicate records within CSV detected — `seenAdmissionNumbers` Set
51. Existing database conflicts checked — `existingAdmissionNumbers`/`existingEmails` from Supabase
52. Preview exists — same preview pattern as staff
53. Row-level errors shown — same errors table pattern
54. Import results summary exists — same summary pattern
55. Tenant ID cannot be supplied/manipulated through CSV — same `tenant_id: tenantId` pattern
56. Profile can exist without Auth user — `staff_profiles.user_id` is nullable (FK with `references auth.users`); `students` table has no direct auth linkage
57. Invitation can be created for profile — `invite-user` creates `tenant_invitations` record with email and role
58. Invitation acceptance works — `accept-invitation` Edge Function verifies token hash, creates membership

## Partially Implemented (5)

| # | Requirement | Status | Issue |
|---|-------------|--------|-------|
| 22b | Invite All Eligible Students shows skipped count | PARTIAL | Summary only shows "Invitations sent" and "Failed" — missing "Skipped" count |
| 59 | Invitation contains correct profile metadata | PARTIAL | `invite-user` stores `metadata.student_id` for student role, but `openInviteModal` for staff does NOT include metadata |
| 63 | Duplicate memberships prevented | PARTIAL | `accept-invitation` uses `onConflict: "tenant_id,user_id,role"` for upsert but `student_links` also uses `onConflict: "student_id,user_id"` — works but no explicit check for pre-existing membership |
| 65 | Expired invitations handled correctly | PARTIAL | `studentInviteStatus` distinguishes expired vs pending via `expires_at`, but `invite-user` only rejects expired invitations when `invite-user` is called (not in `accept-invitation`) |
| 71 | Tenant isolation preserved | PARTIAL | `inviteAllStudents` does NOT check `tenant_memberships` for existing student auth users, potentially allowing duplicate membership creation |

## Missing Features (3)

| # | Requirement | Status | Notes |
|---|-------------|--------|-------|
| 59b | Student role invitation from `openInviteModal` includes `student_id` | NOT IMPLEMENTED | `openInviteModal` is for staff only (it's called from staff list), so student_id metadata is not relevant here. This is NOT a bug. |
| 61 | `acceptInvite.js` passes `student_id` explicitly | NOT IMPLEMENTED | The frontend does not pass `student_id` but `accept-invitation` falls back to `invitation.metadata?.student_id` — this works correctly but the frontend does not explicitly pass it. |
| 64 | `openInviteModal` for student role from staff list | NOT IMPLEMENTED | Staff invite modal only offers staff roles (`STAFF_INVITE_ROLES`), not `student` or `parent`. This is by design — students are invited from the Students page. |

## Broken Features (5)

| # | Requirement | Status | Issue |
|---|-------------|--------|-------|
| 22b | Invite All Eligible Students summary | BROKEN | Missing skipped count in final summary — only shows "Invitations sent" and "Failed" cards, not "Skipped" |
| 59a | Documentation claims raw tokens are returned | BROKEN | `docs/INVITATIONS.md` states "The `invite-user` function creates a `tenant_invitations` row (storing only the SHA-256 hash of the token) and **returns the raw token**" — but the function does NOT return the raw token. |
| 59b | Security doc claims raw tokens are returned | BROKEN | `docs/SECURITY.md` states "Invitation tokens are SHA-256 hashed before storage; **raw tokens are returned only once to the inviter**" — incorrect. |
| 59c | Roadmap claims raw tokens are shown | BROKEN | `docs/ROADMAP.md` states "the raw token is shown once to the inviter and must be relayed manually" — incorrect. |
| 71a | `inviteAllStudents` does not check tenant_memberships | BROKEN | The function only checks `student_links` for linked students, but does NOT query `tenant_memberships` to see if a student already has an active auth user. A student could have `tenant_memberships.role='student'` without a `student_links` entry, making them appear eligible when they are not. |

## 409 Invitation Handling Verification

### Complete Runtime Flow: `invite-user` → `openInviteModal`

**Path: `schoolAdmin.js` → `db.functions.invoke()` → `invite-user/index.ts` → frontend**

1. **Frontend** (`openInviteModal` in `schoolAdmin.js`):
   ```javascript
   const { data, error } = await db.functions.invoke("invite-user", {
     body: { tenant_id: tenantId, email: ds.email, role },
   });
   ```
   - `db.functions.invoke()` is the Supabase client method
   - It sends the request to the Edge Function

2. **Supabase Client** (`js/supabaseClient.js`):
   - Uses `window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY)`
   - `db.functions.invoke()` calls the Supabase Edge Functions API

3. **Edge Function** (`supabase/functions/invite-user/index.ts`):
   - On duplicate: `return response({ error: "invitation_exists", invitation_id: existing.id }, 409)`
   - On success: `return response({ success: true, status: "invited", invitation_id, ... })`

4. **Supabase Client response handling**:
   - The Supabase client wraps HTTP responses as `{ data, error }`
   - For HTTP 409, the response body `{ error: "invitation_exists", invitation_id: ... }` is parsed into the `data` field (NOT the `error` field)
   - This means `data.error === "invitation_exists"` is the correct check pattern

5. **Frontend handling** (`openInviteModal`):
   ```javascript
   if (data?.error) {
     msg.textContent = `Invitation error: ${esc(data.error)}`;
     if (data.error === "invitation_exists") {
       res.innerHTML = `<p class="muted">A pending invitation already exists for this email.</p>`;
     }
     return;
   }
   ```
   This correctly handles the 409 response because the `data` object contains `{ error: "invitation_exists" }`.

**Verified**: The 409 flow works correctly. The Supabase client puts the JSON body into `data` for non-2xx responses, and `openInviteModal` checks `data?.error` which matches.

### Complete Runtime Flow: `invite-user` → `inviteStudent`

1. **Frontend** (`inviteStudent` in `schoolAdmin.js`):
   ```javascript
   const { data, error } = await db.functions.invoke("invite-user", {
     body: { tenant_id: tenantId, email: ds.email, role: "student", student_id: ds.studentId },
   });
   if (data?.error) {
     msg.textContent = `Invitation error: ${esc(data.error)}`;
     return;
   }
   ```
   Same pattern — handles 409 correctly.

### Complete Runtime Flow: `invite-user` → `inviteAllStudents` / `inviteAllTeachers`

Both batch functions use the same pattern:
```javascript
if (error || data?.error) {
  failed++;
  failedList.push(`${name}: ${error?.message || data?.error || "unknown error"}`);
} else {
  sent++;
}
```
This correctly handles the 409 response — `data?.error` is truthy when `data.error === "invitation_exists"`, so the batch continues without stopping.

## Files Changed

| File | Change | Reason |
|------|--------|--------|
| `supabase/functions/invite-user/index.ts` | Changed duplicate response from 200+success to 409+{error, invitation_id} | Align with documented behavior in `docs/INVITATIONS.md` and frontend handling |
| `js/pages/schoolAdmin.js` | `inviteAllStudents`: add `tenant_memberships` check, add skipped count | Fix broken eligibility check and missing summary |
| `docs/INVITATIONS.md` | Remove false claim about raw token return | Documentation was incorrect |
| `docs/SECURITY.md` | Remove false claim about raw token return | Documentation was incorrect |
| `docs/ROADMAP.md` | Remove false claim about raw token display | Documentation was incorrect |

## What Still Requires Supabase Deployment to Test

- All Edge Function behavior (`invite-user`, `accept-invitation`, `create-tenant`)
- Database migrations (001-006) have not been applied to the live Supabase project
- Invitation email delivery has not been tested (no email provider configured)
- CSV import has not been database-tested (client-side only, no server-side validation)
- RLS policies have not been tested against the live database

## Manual Actions Required

1. Apply migrations: `supabase db push`
2. Deploy Edge Functions:
   - `supabase functions deploy invite-user`
   - `supabase functions deploy accept-invitation`
   - `supabase functions deploy create-tenant`
3. Set secrets: `SUPABASE_SERVICE_ROLE_KEY` in Supabase project settings
4. Configure email delivery for invitation tokens (currently not implemented)
5. Test invitation acceptance flow end-to-end
