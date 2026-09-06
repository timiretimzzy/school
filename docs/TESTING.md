# Testing

The database (RLS) is the security boundary; the acceptance test below
exercises both the UI workflows and the privacy boundaries end-to-end. Set up
`docs/DEMO_CREDENTIALS.md` first.

## Test 1: Platform admin

- [ ] Sign in as the platform admin.
- [ ] Dashboard loads with real counts (total/active/trial/suspended
      schools, total students, recently onboarded list).
- [ ] Create a school through the 5-step onboarding wizard.
- [ ] Confirm branding, modules, and an audit log row exist for the new
      tenant, and that an admin invitation token was returned.
- [ ] Suspend, then re-activate, the school; change its subscription status.

## Test 2: School admin

- [ ] Sign in as the school admin. Confirm no platform navigation is visible.
- [ ] Dashboard shows pending invitations card (0 if none exist).
- [ ] Create an academic year, a term, a class, and a subject.
- [ ] Add a staff member **with an email address**; confirm they appear in
      the staff table with the email and an **Invite** button.
- [ ] Click **Invite** next to a staff member; confirm the invitation modal
      opens with a role selector. Click **Generate invitation** and confirm a
      raw token is returned and displayed (copyable).
- [ ] Sign out and sign in as a new user **with the same email** as the
      invitation; visit `#/accept-invite`, paste the token, and confirm the
      `tenant_memberships` row is created with the chosen role.
- [ ] Add a student **with an email address**; confirm the email appears in
      the student profile view.
- [ ] Use **Import CSV** to bulk-import 2–3 students; confirm they appear
      in the student list. Include a row with a deliberately invalid email
      and confirm it is rejected with a clear error.
- [ ] Create a teacher assignment (teacher + subject + class).
- [ ] Enrol the student into the class.

## Test 3: Teacher

- [ ] Sign in as the teacher. Confirm only assigned classes/subjects appear.
- [ ] Record attendance for an assigned class.
- [ ] Create an assessment for an assigned class/subject.
- [ ] Enter marks, save as draft, then publish.

## Test 4: Student

- [ ] Sign in as the student.
- [ ] View own profile, attendance summary, and published results only
      (draft assessments must not appear).

## Test 5: Parent

- [ ] Sign in as the parent. Only linked children appear.
- [ ] View the linked child's attendance and published results.

## Test 6: Privacy — direct query denial

Perform these using the Supabase JS client (or SQL editor "run as user")
signed in as each respective user, not just by hiding UI:

- [ ] **Tenant isolation**: a School A member querying `students`/`classes`
      filtered to a School B `tenant_id` returns zero rows.
- [ ] **Student isolation**: Student A querying
      `assessment_results.eq('student_id', <Student B id>)` returns zero
      rows (expected: denied/empty, not an error).
- [ ] **Teacher scope**: a teacher querying/writing `attendance_records` or
      `assessments` for a class they are **not** assigned to is denied by
      RLS (see `supabase/migrations/004_teacher_scoped_permissions.sql`).
- [ ] **Parent scope**: a parent querying a student they are not linked to
      via `parent_student_relationships` returns zero rows.
- [ ] **Draft visibility**: a student/parent cannot see `assessment_results`
      rows whose `assessments.status = 'draft'` is enforced at the app layer;
      confirm the teacher UI only ever surfaces published rows to students.

## Local database testing

```sh
supabase start
supabase db reset
supabase functions serve create-tenant
supabase functions serve invite-user
supabase functions serve accept-invitation
```
