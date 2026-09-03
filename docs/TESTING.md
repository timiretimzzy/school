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
- [ ] Create an academic year, a term, a class, and a subject.
- [ ] Add a staff member and a student.
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
