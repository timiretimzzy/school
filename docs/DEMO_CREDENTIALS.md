# Demo credentials and setup

This file documents how to stand up the **Demo High School** demo tenant for
sales demonstrations and testing. It is intentionally **not** linked from the
public login page — credentials must never be published there.

Supabase Auth users (email + password) cannot be created by a SQL migration
or seed script; they must be created through the Supabase Dashboard, the
Admin API, or the CLI, and then linked to the rows created by
`supabase/seed.sql`. The steps below are the reproducible process for doing
that.

## 1. Apply the schema and seed data

```sh
supabase db push
psql "$SUPABASE_DB_URL" -f supabase/seed.sql
```

(Or run `supabase/seed.sql` in the Supabase Dashboard SQL editor.)

## 2. Create demo Auth users

Use the Supabase Dashboard → **Authentication → Users → Add user**, or the
CLI/API, to create each user below with **email confirmed** and a password
you choose (do not reuse any real password). Suggested fictional identities:

| Role | Email | Notes |
|---|---|---|
| Platform admin | `admin@fiscalstack.demo` | FiscalStack Solutions super admin |
| School admin | `principal@demohighschool.demo` | Demo High School administrator |
| Teacher | `teacher.okoro@demohighschool.demo` | Assigned to Grade 9A |
| Student | `amara.okafor@demohighschool.demo` | Linked to admission number `DHS-0001` |
| Parent | `parent.okafor@demohighschool.demo` | Guardian of `DHS-0001` |

Example using the Supabase CLI's REST-backed admin API (replace
`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` with your project's values, and
never commit or log the service role key):

```sh
curl -X POST "$SUPABASE_URL/auth/v1/admin/users" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: ******" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@fiscalstack.demo","password":"<choose-a-password>","email_confirm":true}'
```

Repeat for each row in the table above.

## 3. Link each user to their role

After creating the users, copy each user's UUID from the Dashboard (or the
`id` field returned by the admin API) and run the following in the SQL
editor, replacing the placeholder UUIDs:

```sql
-- Platform admin
insert into public.platform_admins (user_id, role)
values ('<admin-uuid>', 'super_admin');

-- School admin membership
insert into public.tenant_memberships (tenant_id, user_id, role)
select id, '<principal-uuid>', 'school_admin' from public.tenants where slug = 'demo-high-school';

-- Teacher membership + assignment to Grade 9A / Mathematics
insert into public.tenant_memberships (tenant_id, user_id, role)
select id, '<teacher-uuid>', 'teacher' from public.tenants where slug = 'demo-high-school';

insert into public.staff_profiles (tenant_id, user_id, employee_number, first_name, last_name, job_title)
select id, '<teacher-uuid>', 'EMP-0001', 'Chidi', 'Okoro', 'Mathematics Teacher'
from public.tenants where slug = 'demo-high-school';

insert into public.teacher_assignments (tenant_id, teacher_user_id, class_id, subject_id)
select t.id, '<teacher-uuid>', c.id, s.id
from public.tenants t
join public.classes c on c.tenant_id = t.id and c.name = 'Grade 9A'
join public.subjects s on s.tenant_id = t.id and s.name = 'Mathematics'
where t.slug = 'demo-high-school';

-- Student membership + link to the seeded student record
insert into public.tenant_memberships (tenant_id, user_id, role)
select id, '<student-uuid>', 'student' from public.tenants where slug = 'demo-high-school';

insert into public.student_links (tenant_id, student_id, user_id, relationship)
select t.id, st.id, '<student-uuid>', 'self'
from public.tenants t join public.students st on st.tenant_id = t.id and st.admission_number = 'DHS-0001'
where t.slug = 'demo-high-school';

-- Parent profile + link to their child
insert into public.parent_profiles (tenant_id, user_id, first_name, last_name)
select id, '<parent-uuid>', 'Ngozi', 'Okafor' from public.tenants where slug = 'demo-high-school';

insert into public.parent_student_relationships (tenant_id, parent_id, student_id, relationship)
select t.id, p.id, st.id, 'guardian'
from public.tenants t
join public.parent_profiles p on p.tenant_id = t.id and p.user_id = '<parent-uuid>'
join public.students st on st.tenant_id = t.id and st.admission_number = 'DHS-0001'
where t.slug = 'demo-high-school';
```

In production onboarding, steps 2–3 are performed instead through the
platform admin's onboarding wizard (which creates a `tenant_invitations`
row) and the `accept-invitation` Edge Function, which a real user completes
after signing up. The manual SQL above exists only because seeding
passwords automatically is not possible/safe.

## 4. Sign in

Serve the frontend (see `README.md`/`docs/DEPLOYMENT.md`), then sign in with
each demo email/password to exercise the corresponding workspace:

- Platform admin → platform dashboard, schools, onboarding wizard.
- School admin → school dashboard, academic setup, students, staff, announcements.
- Teacher → assigned classes, attendance, assessments and marks.
- Student → own profile, attendance summary, published results, announcements.
- Parent → linked children only, their attendance and published results.

## 5. Rotate or remove demo users

These are fictional identities for demonstration only. Delete the demo Auth
users and the `demo-high-school` tenant (cascades via `tenant_id` foreign
keys) before or instead of onboarding a real paying customer.
