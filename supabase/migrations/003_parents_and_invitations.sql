-- Parent portal foundation, invitation acceptance, and announcement audience visibility.

create table public.parent_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  first_name text not null,
  last_name text not null,
  phone text,
  created_at timestamptz not null default now(),
  unique(tenant_id, user_id)
);

create table public.parent_student_relationships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants on delete cascade,
  parent_id uuid not null references public.parent_profiles on delete cascade,
  student_id uuid not null references public.students on delete cascade,
  relationship text not null default 'guardian',
  created_at timestamptz not null default now(),
  unique(parent_id, student_id)
);

alter table public.parent_profiles enable row level security;
alter table public.parent_student_relationships enable row level security;

create or replace function public.is_linked_parent(s uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1
    from public.parent_student_relationships r
    join public.parent_profiles p on p.id = r.parent_id
    where r.student_id = s and p.user_id = auth.uid()
  )
$$;

-- Broaden linked-student check to also cover parent relationships, without
-- altering the function signature used throughout existing policies.
create or replace function public.is_linked_student(s uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists(select 1 from public.student_links where student_id = s and user_id = auth.uid())
    or exists(
      select 1 from public.tenant_memberships m
      where m.user_id = auth.uid() and m.role = 'student' and m.active
        and exists(select 1 from public.students st where st.id = s and st.tenant_id = m.tenant_id)
    )
    or public.is_linked_parent(s)
$$;

create policy parent_profiles_self on public.parent_profiles
  for select using (has_tenant_membership(tenant_id) and (user_id = auth.uid() or has_permission(tenant_id, 'manage_students')));
create policy parent_profiles_manage on public.parent_profiles
  for all using (has_permission(tenant_id, 'manage_students')) with check (has_permission(tenant_id, 'manage_students'));

create policy parent_links_read on public.parent_student_relationships
  for select using (
    has_permission(tenant_id, 'manage_students')
    or exists(select 1 from public.parent_profiles p where p.id = parent_id and p.user_id = auth.uid())
  );
create policy parent_links_manage on public.parent_student_relationships
  for all using (has_permission(tenant_id, 'manage_students')) with check (has_permission(tenant_id, 'manage_students'));

-- Announcements: readers should only see items targeted at their audience,
-- published (not future-dated), and not expired. Writers must hold the
-- manage_announcements permission.
drop policy if exists tenant_access_announcements on public.announcements;
create policy announcements_read on public.announcements
  for select using (
    has_permission(tenant_id, 'manage_announcements')
    or (
      has_tenant_membership(tenant_id)
      and (published_at is null or published_at <= now())
      and (expires_at is null or expires_at > now())
      and (
        audience = 'all'
        or (audience = 'staff' and exists(select 1 from public.tenant_memberships m where m.tenant_id = announcements.tenant_id and m.user_id = auth.uid() and m.active and m.role not in ('parent', 'student')))
        or (audience = 'students' and exists(select 1 from public.tenant_memberships m where m.tenant_id = announcements.tenant_id and m.user_id = auth.uid() and m.active and m.role = 'student'))
        or (audience = 'parents' and exists(select 1 from public.parent_profiles p where p.tenant_id = announcements.tenant_id and p.user_id = auth.uid()))
      )
    )
  );
create policy announcements_manage on public.announcements
  for all using (has_permission(tenant_id, 'manage_announcements')) with check (has_permission(tenant_id, 'manage_announcements'));

-- Invitations: an invited (not-yet-member) user must be able to see their own
-- pending invitation by email in order to accept it client-side before the
-- accept-invitation Edge Function grants membership.
create policy invitations_self_read on public.tenant_invitations
  for select using (
    has_permission(tenant_id, 'manage_tenant')
    or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
