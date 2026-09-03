-- Tighten teacher permissions so that holding the generic 'record_attendance'
-- or 'manage_results' permission is not, by itself, sufficient: a teacher
-- must additionally be assigned (via teacher_assignments) to the specific
-- class/subject being acted on. Admin-like roles (school_admin, principal,
-- registrar) and platform admins are not subject to this extra restriction.

create or replace function public.is_admin_like(t uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.is_platform_admin() or exists(
    select 1 from public.tenant_memberships m
    where m.tenant_id = t and m.user_id = auth.uid() and m.active
      and m.role in ('school_admin', 'principal', 'registrar')
  )
$$;

create or replace function public.is_assigned_to_class(t uuid, c uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists(
    select 1 from public.teacher_assignments a
    where a.tenant_id = t and a.class_id = c and a.teacher_user_id = auth.uid()
  )
$$;

create or replace function public.is_assigned_to_class_subject(t uuid, c uuid, s uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists(
    select 1 from public.teacher_assignments a
    where a.tenant_id = t and a.class_id = c and a.subject_id = s and a.teacher_user_id = auth.uid()
  )
$$;

-- Attendance: restrict writes to admin-like roles or the assigned teacher.
drop policy if exists attendance_write on public.attendance_records;
create policy attendance_write on public.attendance_records
  for all using (
    has_permission(tenant_id, 'record_attendance')
    and (is_admin_like(tenant_id) or (class_id is not null and is_assigned_to_class(tenant_id, class_id)))
  )
  with check (
    has_permission(tenant_id, 'record_attendance')
    and (is_admin_like(tenant_id) or (class_id is not null and is_assigned_to_class(tenant_id, class_id)))
  );

-- Assessments: replace the broad tenant-membership policy with explicit
-- read (any tenant member) and write (manage_results + assignment) policies.
drop policy if exists tenant_access_assessments on public.assessments;
create policy assessments_read on public.assessments for select using (has_tenant_membership(tenant_id));
create policy assessments_write on public.assessments
  for all using (
    has_permission(tenant_id, 'manage_results')
    and (is_admin_like(tenant_id) or is_assigned_to_class_subject(tenant_id, class_id, subject_id))
  )
  with check (
    has_permission(tenant_id, 'manage_results')
    and (is_admin_like(tenant_id) or is_assigned_to_class_subject(tenant_id, class_id, subject_id))
  );

-- Assessment results: students/parents may only read results for published
-- assessments; result managers (admins/teachers with manage_results) may
-- read drafts too, so they can review before publishing.
drop policy if exists results_read on public.assessment_results;
create policy results_read on public.assessment_results
  for select using (
    has_permission(tenant_id, 'manage_results')
    or (
      is_linked_student(student_id)
      and exists(select 1 from public.assessments a where a.id = assessment_id and a.status = 'published')
    )
  );

-- Assessment results: writing marks additionally requires the assessment's
-- class/subject to be one the acting teacher is assigned to.
drop policy if exists results_write on public.assessment_results;
create policy results_write on public.assessment_results
  for all using (
    has_permission(tenant_id, 'manage_results')
    and exists(
      select 1 from public.assessments a where a.id = assessment_id and a.tenant_id = assessment_results.tenant_id
        and (is_admin_like(assessment_results.tenant_id) or is_assigned_to_class_subject(assessment_results.tenant_id, a.class_id, a.subject_id))
    )
  )
  with check (
    has_permission(tenant_id, 'manage_results')
    and mark <= (select maximum_mark from public.assessments a where a.id = assessment_id and a.tenant_id = assessment_results.tenant_id)
    and exists(
      select 1 from public.assessments a where a.id = assessment_id and a.tenant_id = assessment_results.tenant_id
        and (is_admin_like(assessment_results.tenant_id) or is_assigned_to_class_subject(assessment_results.tenant_id, a.class_id, a.subject_id))
    )
  );
