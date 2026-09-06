# Authorization Audit Report
**Project:** EduStack (uvmgmbwnsdebtkwldfaa)
**Date:** 2026-09-05
**Scope:** Full authorization, tenant isolation, and RBAC audit

---

## Executive Summary

The application has a **strong authorization foundation** with RLS enabled on all 32 tables, a role-based permission system (7 permissions across 8 roles), and SECURITY DEFINER helper functions. However, **critical vulnerabilities exist** that must be addressed before production deployment.

---

## 1. Authorization Architecture Overview

### Roles (membership_role enum)
| Role | Hierarchy | Permissions |
|------|-----------|-------------|
| `school_admin` | Highest | All 7 permissions |
| `principal` | High | 5 permissions (no manage_tenant, view_finance) |
| `registrar` | Medium | 2 permissions (manage_students, manage_academics) |
| `teacher` | Medium | 2 permissions (record_attendance, manage_results) |
| `finance_officer` | Low | 1 permission (view_finance) |
| `librarian` | None | No permissions assigned |
| `parent` | None | No permissions assigned |
| `student` | None | No permissions assigned |

### Platform Roles (platform_role enum)
| Role | Description |
|------|-------------|
| `super_admin` | Full platform access |
| `support_admin` | Support access (no permissions defined) |

---

## 2. Critical Vulnerabilities

### VULN-1: platform_admins Table Has NO RLS Policies
**Severity:** CRITICAL
**Table:** `platform_admins`
**Issue:** The `platform_admins` table has RLS enabled (`relrowsecurity = true`) but **zero policies defined**. This means:
- No one can SELECT from this table (including the `is_platform_admin()` helper function which queries it)
- The helper function `is_platform_admin()` uses SECURITY DEFINER, so it bypasses RLS, but direct queries will fail
- Platform admins cannot be managed via standard Supabase client

**Impact:** Platform admin management is broken; `is_platform_admin()` works only because it's SECURITY DEFINER.

### VULN-2: librarian Role Has No Permissions
**Severity:** HIGH
**Role:** `librarian`
**Issue:** The `librarian` role exists in the `membership_role` enum and `roles` table, but has **zero entries in `role_permissions`**. Users with this role have no access to any permission-gated resources.

### VULN-3: parent/student Roles Have No Permissions (By Design?)
**Severity:** MEDIUM
**Roles:** `parent`, `student`
**Issue:** These roles intentionally have no permissions in `role_permissions`. Their access is controlled via:
- `is_linked_student()` / `is_linked_parent()` helper functions
- Direct RLS policies checking user_id matches
- This is **correct** for least privilege, but must be documented.

### VULN-4: Multiple Tables Use Overly Permissive Policies
**Severity:** HIGH
**Tables:** `classes`, `subjects`, `teacher_assignments`, `student_links`, `academic_years`, `terms`, `grades_or_forms`

**Issue:** These tables use `has_tenant_membership(tenant_id)` for ALL operations (SELECT, INSERT, UPDATE, DELETE). This means **any authenticated tenant member** (including students and parents) can:
- CREATE/UPDATE/DELETE classes
- CREATE/UPDATE/DELETE subjects  
- CREATE/UPDATE/DELETE teacher assignments
- CREATE/UPDATE/DELETE student links

**Example:** A student can execute:
```sql
INSERT INTO classes (tenant_id, name) VALUES ('tenant-uuid', 'Hacked Class');
```

### VULN-5: staff_profiles Policy Allows Full Access to All Tenant Members
**Severity:** HIGH
**Table:** `staff_profiles`
**Policy:** `tenant_access_staff_profiles` uses `has_tenant_membership(tenant_id)` for ALL operations.

**Issue:** Any authenticated tenant member (student, parent) can:
- Read ALL staff profiles (PII exposure)
- INSERT/UPDATE/DELETE staff profiles

### VULN-6: tenant_invitations Policy Allows Tenant-Wide Access
**Severity:** MEDIUM
**Table:** `tenant_invitations`
**Policy:** `tenant_access_tenant_invitations` allows ALL operations for any tenant member.

**Issue:** Any authenticated user can read ALL invitations (email enumeration), create invitations, etc.

### VULN-7: audit_logs Read Policy Leaks Cross-Tenant Data Potential
**Severity:** MEDIUM
**Table:** `audit_logs`
**Policy:** `audit_read` allows `is_platform_admin() OR has_tenant_membership(tenant_id)`

**Issue:** The `tenant_id` column is nullable (`is_nullable: YES`). If NULL, `has_tenant_membership(NULL)` returns false, but a platform admin can see all logs. Need to ensure tenant_id is always set.

### VULN-8: Missing Input Validation on tenant_id in Edge Functions
**Severity:** MEDIUM
**Functions:** `create-account`, `invite-user`, `login-with-login-id` (for profile lookup)

**Issue:** While most Edge Functions verify the caller's membership for the provided `tenant_id`, they trust the `tenant_id` from the request body for the target operation. A malicious caller with access to Tenant A could potentially pass Tenant B's ID if they can guess it (though RLS would block the actual DB operation since they lack membership).

---

## 3. Tenant Isolation Analysis

### Tables with tenant_id (24 tables)
All 24 tables with `tenant_id` have RLS enabled. However, **not all properly isolate**:

| Table | Isolation Quality | Issue |
|-------|------------------|-------|
| `students` | ✅ Good | `is_linked_student()` for read, `manage_students` for write |
| `staff_profiles` | ❌ Broken | Any tenant member can read/write all staff |
| `parent_profiles` | ✅ Good | Self-read + `manage_students` for write |
| `tenant_memberships` | ✅ Good | Self-read + `manage_tenant`/platform admin for write |
| `classes` | ❌ Broken | Any tenant member can CRUD |
| `subjects` | ❌ Broken | Any tenant member can CRUD |
| `teacher_assignments` | ❌ Broken | Any tenant member can CRUD |
| `student_links` | ❌ Broken | Any tenant member can CRUD |
| `academic_years` | ❌ Broken | Any tenant member can CRUD |
| `terms` | ❌ Broken | Any tenant member can CRUD |
| `grades_or_forms` | ❌ Broken | Any tenant member can CRUD |
| `attendance_records` | ✅ Good | `record_attendance` + teacher assignment check |
| `assessments` | ✅ Good | `manage_results` + assignment check |
| `assessment_results` | ✅ Good | Complex but correct |
| `announcements` | ✅ Good | `manage_announcements` + audience filtering |
| `student_enrolments` | ✅ Good | `manage_students` for write, student read |
| `teacher_assignments` | ❌ Broken | Duplicate entry - any tenant member CRUD |

### Cross-Tenant Attack Vectors
1. **UUID Guessing:** If a user knows a UUID from another tenant, RLS policies using `has_tenant_membership(tenant_id)` will correctly block access because the user lacks membership in that tenant.
2. **tenant_id Manipulation:** Frontend sends `tenant_id` from active context. A malicious user could modify the request, but RLS would block since they lack membership in the target tenant.
3. **Platform Admin Access:** `is_platform_admin()` bypasses all tenant checks - correct for platform role.

---

## 4. Edge Function Authorization Audit

| Function | Auth Required | Role Check | Tenant Validation | Service Role Usage |
|----------|---------------|------------|-------------------|-------------------|
| `create-account` | ✅ | school_admin/principal + platform_admin | ✅ Caller membership verified | ✅ Used for auth admin + DB writes with authorization |
| `login-with-login-id` | ❌ Public | N/A | N/A | ✅ Used for profile lookup + auth admin |
| `change-password` | ✅ | Self only | N/A | ✅ Used for auth admin + membership update |
| `invite-user` | ✅ | school_admin/principal + platform_admin | ✅ Caller membership verified | ✅ Used for DB writes with authorization |
| `accept-invitation` | ✅ | Self only (email match) | N/A | ✅ Used for membership upsert + profile linking |
| `create-tenant` | ✅ | platform_admin only | N/A | ✅ Used for tenant creation |

**Findings:**
- All Edge Functions properly authenticate and authorize callers
- Service role is used correctly with explicit authorization checks before privileged operations
- No Edge Function blindly trusts `tenant_id` from request body without verifying caller's membership

---

## 5. Frontend Authorization Audit

### Route Guards (app.js)
- ✅ Route guard checks `must_change_password` and redirects to password change
- ✅ Context switching uses `buildContexts()` from resolved identity
- ⚠️ **No route-level role guards** - any authenticated user with a context can access routes
- ⚠️ **No tenant boundary checks** - frontend trusts `tenant_id` from context

### API Calls (schoolAdmin.js, teacher.js, student.js, parent.js)
- All queries use `tenant_id` from active context
- RLS policies enforce actual authorization
- Frontend role checks are UX-only (e.g., showing/hiding buttons)

### Context Building (session.js)
- `resolveIdentity()` fetches memberships, parent profile
- `buildContexts()` creates workspace contexts from memberships
- **Issue:** A user with multiple memberships across tenants can switch contexts - this is intentional

---

## 6. Authorization Matrix

| Resource | Platform Admin | School Admin | Principal | Registrar | Teacher | Finance Officer | Student | Parent |
|----------|---------------|--------------|-----------|-----------|---------|-----------------|---------|--------|
| **Tenants** | CRUD | R (own) | R (own) | - | - | - | - | - |
| **Users/Memberships** | CRUD | CRUD | CRUD | R | - | - | R (self) | R (self) |
| **Students** | CRUD | CRUD | CRUD | CRUD | R (assigned) | - | R (self) | R (linked) |
| **Staff/Teachers** | CRUD | CRUD | CRUD | R | R (self) | - | - | - |
| **Parents** | CRUD | CRUD | CRUD | R | - | - | - | R (self) |
| **Classes** | CRUD | CRUD | CRUD | CRUD | R (assigned) | - | R (enrolled) | R (child) |
| **Subjects** | CRUD | CRUD | CRUD | CRUD | R (assigned) | - | R (enrolled) | R (child) |
| **Attendance** | CRUD | CRUD | CRUD | CRUD | CRUD (assigned) | - | R (self) | R (child) |
| **Assessments** | CRUD | CRUD | CRUD | CRUD | CRUD (assigned) | - | R (published) | R (child) |
| **Results** | CRUD | CRUD | CRUD | CRUD | CRUD (assigned) | - | R (published) | R (child) |
| **Announcements** | CRUD | CRUD | CRUD | CRUD | R | - | R (audience) | R (audience) |
| **Finance** | CRUD | CRUD | - | - | - | R | - | - |
| **Invitations** | CRUD | CRUD | CRUD | - | - | - | R (self) | R (self) |
| **Branding** | CRUD | CRUD | - | - | - | - | - | - |
| **Audit Logs** | CRUD | R | R | - | - | - | - | - |

**Legend:** C=Create, R=Read, U=Update, D=Delete, (assigned)=only assigned classes/students, (self)=own record only, (linked)=linked children only

---

## 6. Required Fixes (Priority Order)

### P0 - Critical (Must Fix Before Production)
1. **Add RLS policies for `platform_admins` table**
2. **Fix `staff_profiles` policies** - restrict read to admin-like roles, write to admin-like
3. **Fix `classes`, `subjects`, `teacher_assignments`, `student_links`, `academic_years`, `terms`, `grades_or_forms`** - restrict write to admin-like roles, read to tenant members
4. **Fix `tenant_invitations` policies** - restrict read/write to admin-like roles

### P1 - High
5. **Assign permissions to `librarian` role** or remove role
6. **Add `tenant_id` NOT NULL constraint** to `audit_logs.tenant_id`
7. **Add missing `platform_admins` RLS policies**

### P2 - Medium
8. **Document parent/student permission model** (intentional no-permissions design)
9. **Add permission for `librarian` role** (e.g., library module access)
10. **Consider adding `audience` validation** to announcements policy

### P3 - Low
11. **Add `finance_officer` to `role_permissions`** (currently missing from audit but exists in enum)
12. **Review `rls_auto_enable`** - ensure it doesn't enable RLS on system tables

---

## 7. Recommended RLS Policy Changes

### platform_admins (NEW POLICIES)
```sql
-- Platform admins can read platform_admins
CREATE POLICY "platform_admins_read" ON platform_admins
  FOR SELECT USING (is_platform_admin());

-- Platform admins can manage platform_admins
CREATE POLICY "platform_admins_manage" ON platform_admins
  FOR ALL USING (is_platform_admin()) WITH CHECK (is_platform_admin());
```

### staff_profiles (FIX)
```sql
-- Replace tenant_access_staff_profiles with:
CREATE POLICY "staff_profiles_read" ON staff_profiles
  FOR SELECT USING (
    is_admin_like(tenant_id) 
    OR user_id = auth.uid()
    OR is_linked_parent(id)  -- for parent portal showing teachers
  );

CREATE POLICY "staff_profiles_write" ON staff_profiles
  FOR ALL USING (is_admin_like(tenant_id))
  WITH CHECK (is_admin_like(tenant_id));
```

### classes (FIX)
```sql
-- Replace tenant_access_classes with:
CREATE POLICY "classes_read" ON classes
  FOR SELECT USING (has_tenant_membership(tenant_id));

CREATE POLICY "classes_write" ON classes
  FOR ALL USING (is_admin_like(tenant_id))
  WITH CHECK (is_admin_like(tenant_id));
```

### subjects (FIX)
```sql
CREATE POLICY "subjects_read" ON subjects
  FOR SELECT USING (has_tenant_membership(tenant_id));

CREATE POLICY "subjects_write" ON subjects
  FOR ALL USING (is_admin_like(tenant_id))
  WITH CHECK (is_admin_like(tenant_id));
```

### teacher_assignments (FIX)
```sql
CREATE POLICY "teacher_assignments_read" ON teacher_assignments
  FOR SELECT USING (
    has_tenant_membership(tenant_id)
  );

CREATE POLICY "teacher_assignments_write" ON teacher_assignments
  FOR ALL USING (
    is_admin_like(tenant_id)
    OR (teacher_user_id = auth.uid())  -- teachers can see their own assignments
  )
  WITH CHECK (is_admin_like(tenant_id));
```

### student_links (FIX)
```sql
CREATE POLICY "student_links_read" ON student_links
  FOR SELECT USING (
    is_admin_like(tenant_id)
    OR user_id = auth.uid()
    OR is_linked_parent(student_id)
  );

CREATE POLICY "student_links_write" ON student_links
  FOR ALL USING (is_admin_like(tenant_id))
  WITH CHECK (is_admin_like(tenant_id));
```

### academic_years, terms, grades_or_forms (FIX)
```sql
CREATE POLICY "{table}_read" ON {table}
  FOR SELECT USING (has_tenant_membership(tenant_id));

CREATE POLICY "{table}_write" ON {table}
  FOR ALL USING (is_admin_like(tenant_id))
  WITH CHECK (is_admin_like(tenant_id));
```

### tenant_invitations (FIX)
```sql
-- Keep tenant_access_tenant_invitations for admin operations
-- Add self-read policy
CREATE POLICY "invitations_self_read" ON tenant_invitations
  FOR SELECT USING (
    has_permission(tenant_id, 'manage_tenant')
    OR (lower(email) = lower(auth.jwt() ->> 'email'))
  );
```

---

## 8. Test Plan for Security Boundaries

### Cross-Tenant Isolation Tests
```javascript
// Test 1: Tenant A admin cannot read Tenant B students
// Test 2: Tenant A admin cannot modify Tenant B students
// Test 3: Tenant A teacher cannot access Tenant B data
// Test 4: Tenant A student cannot access Tenant B student records
```

### Student Isolation Tests
```javascript
// Test 1: Student A cannot read Student B profile
// Test 2: Student A cannot read Student B results
// Test 3: Student A cannot modify Student B information
```

### Parent Isolation Tests
```javascript
// Test 1: Parent A cannot access children unrelated to them
```

### Teacher Restriction Tests
```javascript
// Test 1: Teacher cannot access unrelated classes
// Test 2: Teacher cannot modify school administration settings
// Test 3: Teacher cannot create privileged accounts
// Test 4: Teacher cannot access unrelated student records
```

### Privilege Escalation Tests
```javascript
// Test 1: Changing role in requests
// Test 2: Changing tenant_id in requests
// Test 3: Supplying another user's UUID
// Test 4: Calling Edge Functions directly without auth
// Test 5: Calling protected Supabase tables directly
```

---

## 9. Summary of Files Requiring Changes

### Database (RLS Policies)
- `platform_admins` - ADD policies
- `staff_profiles` - REPLACE policies
- `classes` - REPLACE policies
- `subjects` - REPLACE policies
- `teacher_assignments` - REPLACE policies
- `student_links` - REPLACE policies
- `academic_years` - REPLACE policies
- `terms` - REPLACE policies
- `grades_or_forms` - REPLACE policies
- `tenant_invitations` - ADD self-read policy

### Database (Data)
- `role_permissions` - ADD librarian permissions

### Database (Schema)
- `audit_logs.tenant_id` - ADD NOT NULL constraint

### Edge Functions
- All Edge Functions pass authorization audit - **no changes needed**

### Frontend
- **No changes needed** - RLS is the enforcement layer

---

## 10. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Student deletes all classes | HIGH (current) | HIGH | Fix class RLS policies |
| Student reads all staff PII | HIGH (current) | HIGH | Fix staff_profiles RLS |
| Tenant A admin accesses Tenant B | LOW (RLS works) | CRITICAL | Verify RLS on all tables |
| Parent accesses unrelated children | MEDIUM | HIGH | Verify is_linked_parent() |
| Platform admin impersonation | LOW | CRITICAL | Protect platform_admins table |

---

## Conclusion

The authorization system has **excellent architectural foundations** (RLS everywhere, helper functions, permission system) but **critical policy misconfigurations** expose data and allow unauthorized modifications. The **top priority** is fixing the overly permissive policies on `staff_profiles`, `classes`, `subjects`, `teacher_assignments`, and `student_links` before any production deployment.

**Estimated effort:** 2-4 hours for P0 fixes, 4-8 hours for all fixes.