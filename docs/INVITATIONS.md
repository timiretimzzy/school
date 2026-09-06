# Invitations

EduStack uses a token-based invitation workflow backed by the
`tenant_invitations` table and two authenticated Edge Functions
(`invite-user`, `accept-invitation`). Transactional email delivery is **not**
wired up yet (see `docs/ROADMAP.md`).

## Who can invite

The `invite-user` Edge Function authorizes the caller as one of:

- **Platform admin** — can invite for any tenant.
- **School admin** — can invite for their own tenant.
- **Principal** — can invite for their own tenant.

Any other role (registrar, teacher, finance officer, etc.) receives a
`403 forbidden` response.

## Staff invitation flow (school admin)

1. **Add staff** — In the *Staff & teachers* section, fill in the add-staff
   form (including the **Email** field) and submit. A `staff_profiles` row is
   created.

2. **Send invitation** — Click the **"Invite"** button next to the staff
   member. A modal appears letting you pick the invitee's role (Teacher,
   Finance officer, Librarian, Registrar, or Principal). Click
   **"Send invitation"**.

3. **Invitation created** — The `invite-user` function creates a
   `tenant_invitations` row storing only the SHA-256 hash of the token.
   The frontend receives `{ success: true, status: "invited", invitation_id, ... }`.
   The token is used solely for email delivery by the configured email provider
   (not yet wired up — see `docs/MANUAL_ACTIONS_REQUIRED.md`).

4. **Staff member accepts** — The invitee signs in (or signs up) with the
   **same email address** that was invited, then visits
   `#/accept-invite`, pastes the token, and clicks **Accept invitation**.
   The `accept-invitation` function verifies the email match, creates the
   `tenant_memberships` row, and marks the invitation as `accepted_at`.

5. **Verification** — The staff table shows a "linked" badge once the
   invitee's auth user appears in `tenant_memberships`.

## Duplicate prevention

If a pending, unexpired invitation already exists for the same email +
tenant, the `invite-user` function returns HTTP `409` with
`{ error: "invitation_exists", invitation_id: "..." }`. The UI displays this
as an informational message.

## Student invitation flow

Students can be invited individually or in bulk:

1. **Import or add a student** — Use the *Import CSV* button or the *Add
   student* form on the *Students* page to create student records (with an
   `email` if available).

2. **Invite** — Click the **"Invite"** button next to a student in the student
   list, or use **"Invite All Eligible Students"** to batch-invite all students
   with valid emails and no pending invitations or active memberships.

3. **Student accepts** — The student visits `#/accept-invite`, pastes the
   token, and clicks **Accept invitation**. The `accept-invitation` function
   verifies the email match, creates the `tenant_memberships` row, creates
   a `student_links` entry, and marks the invitation as `accepted_at`.

## Bulk invite all

Both the **Students** and **Staff** pages support "Invite All Eligible":

- **Students** — `inviteAllStudents` queries students with valid emails,
  no `student_links`, and no pending `tenant_invitations`, then processes
  them sequentially with progress display and a final summary showing
  sent, skipped, and failed counts.
- **Staff** — `inviteAllTeachers` queries staff with valid emails,
  no linked auth user, and no pending `tenant_invitations`, then processes
  them sequentially with the same summary format.

## Bulk import (CSV)

Both the **Students** and **Staff** pages support CSV import:

- **Students** — Paste CSV with headers. Required: `admission_number,
  first_name, last_name`. Optional: `middle_name, date_of_birth, gender,
  email, phone, guardian_name, guardian_phone`.
- **Staff** — Paste CSV with headers. Required: `employee_number,
  first_name, last_name`. Optional: `email, department, job_title`.

The shared `parseCSV` helper (`js/util.js`) handles quoted fields, embedded
commas, and escaped double-quotes. Each row is validated client-side before
insert; valid rows are bulk-upserted via PostgREST. Skipped rows are listed
so the admin can fix and re-import.

## Invitation table schema

| Column             | Type         | Notes                                                  |
|--------------------|--------------|--------------------------------------------------------|
| `id`               | `uuid`       | Primary key                                            |
| `tenant_id`        | `uuid`       | Foreign key → `tenants`                                |
| `email`            | `citext`     | The invitee's email address                            |
| `role`             | `membership_role` | The role to grant on acceptance                   |
| `token_hash`       | `text`       | SHA-256 hex of the raw token (never store plaintext)   |
| `expires_at`       | `timestamptz`| Typically 7 days from creation                         |
| `accepted_at`      | `timestamptz`| `null` until accepted                                  |
| `invited_by`       | `uuid`       | Who sent the invitation                                |
| `metadata`         | `jsonb`      | Additional data (e.g., `{"student_id": "..."}`)        |
| `token_delivered`  | `boolean`    | Whether the token was delivered via email              |
| `created_at`       | `timestamptz`| Row creation timestamp                                 |

## Security notes

- The service-role key is used **only** inside Edge Functions, never in the
  browser frontend.
- RLS allows an invited (not-yet-member) user to read their own pending
  invitation by email (`invitations_self_read` policy from migration 003).
- The `accept-invitation` function verifies that the caller's auth email
  matches the invitation email before creating membership.
- Tokens are 256 bits of entropy (two concatenated UUIDs) and are stored only
  as a SHA-256 hash. Raw tokens are **never** returned to the frontend.
- The `invite-user` function returns only safe status information:
  `{ success, status, invitation_id, email, role, expires_at, message }`.
