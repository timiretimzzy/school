-- EduStack Test Data Seed Script
-- Run via Supabase SQL Editor or REST API

-- 1. Create tenant
INSERT INTO tenants (id, name, motto, phone, email, subscription_status, created_at)
VALUES (
  'f3512611-7697-4838-bff0-48f9953e12af',
  'FiscalStack Academy',
  'Excellence in Education',
  '+263 77 123 4567',
  'admin@fiscalstack.co.zw',
  'active',
  now()
) ON CONFLICT (id) DO NOTHING;

-- 2. Create tenant domain
INSERT INTO tenant_domains (id, tenant_id, domain, created_at)
VALUES (
  gen_random_uuid(),
  'f3512611-7697-4838-bff0-48f9953e12af',
  'fiscalstack.co.zw',
  now()
) ON CONFLICT (domain) DO NOTHING;

-- 3. Create platform admin
INSERT INTO platform_admins (user_id, created_at)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  now()
) ON CONFLICT (user_id) DO NOTHING;

-- 4. Create classes
INSERT INTO classes (id, tenant_id, name, created_at)
VALUES
  ('a1000000-0000-0000-0000-000000000001', 'f3512611-7697-4838-bff0-48f9953e12af', 'Form 1A', now()),
  ('a1000000-0000-0000-0000-000000000002', 'f3512611-7697-4838-bff0-48f9953e12af', 'Form 2A', now()),
  ('a1000000-0000-0000-0000-000000000003', 'f3512611-7697-4838-bff0-48f9953e12af', 'Form 3A', now())
ON CONFLICT (id) DO NOTHING;

-- 5. Create subjects
INSERT INTO subjects (id, tenant_id, name, code, created_at)
VALUES
  ('b1000000-0000-0000-0000-000000000001', 'f3512611-7697-4838-bff0-48f9953e12af', 'Mathematics', 'MATH', now()),
  ('b1000000-0000-0000-0000-000000000002', 'f3512611-7697-4838-bff0-48f9953e12af', 'English', 'ENG', now()),
  ('b1000000-0000-0000-0000-000000000003', 'f3512611-7697-4838-bff0-48f9953e12af', 'Science', 'SCI', now()),
  ('b1000000-0000-0000-0000-000000000004', 'f3512611-7697-4838-bff0-48f9953e12af', 'History', 'HIST', now())
ON CONFLICT (id) DO NOTHING;

-- 6. Create academic year
INSERT INTO academic_years (id, tenant_id, name, starts_on, ends_on, is_current, created_at)
VALUES (
  'c1000000-0000-0000-0000-000000000001',
  'f3512611-7697-4838-bff0-48f9953e12af',
  '2026',
  '2026-01-01',
  '2026-12-31',
  true,
  now()
) ON CONFLICT (id) DO NOTHING;

-- 7. Create term
INSERT INTO terms (id, tenant_id, academic_year_id, name, starts_on, ends_on, created_at)
VALUES (
  'd1000000-0000-0000-0000-000000000001',
  'f3512611-7697-4838-bff0-48f9953e12af',
  'c1000000-0000-0000-0000-000000000001',
  'Term 1',
  '2026-01-01',
  '2026-04-30',
  now()
) ON CONFLICT (id) DO NOTHING;

-- 8. Create grading scale with levels
INSERT INTO grading_scales (id, tenant_id, name, is_default, created_at)
VALUES (
  'e1000000-0000-0000-0000-000000000001',
  'f3512611-7697-4838-bff0-48f9953e12af',
  'Standard A-F',
  true,
  now()
) ON CONFLICT (id) DO NOTHING;

INSERT INTO grading_scale_levels (id, scale_id, label, min_mark, max_mark, gpa_points, sort_order)
VALUES
  (gen_random_uuid(), 'e1000000-0000-0000-0000-000000000001', 'A', 80, 100, 4.0, 1),
  (gen_random_uuid(), 'e1000000-0000-0000-0000-000000000001', 'B', 70, 79, 3.0, 2),
  (gen_random_uuid(), 'e1000000-0000-0000-0000-000000000001', 'C', 60, 69, 2.0, 3),
  (gen_random_uuid(), 'e1000000-0000-0000-0000-000000000001', 'D', 50, 59, 1.0, 4),
  (gen_random_uuid(), 'e1000000-0000-0000-0000-000000000001', 'F', 0, 49, 0.0, 5)
ON CONFLICT DO NOTHING;

-- 9. Create fee categories and structures
INSERT INTO fee_categories (id, tenant_id, name, description, sort_order, created_at)
VALUES
  ('f1000000-0000-0000-0000-000000000001', 'f3512611-7697-4838-bff0-48f9953e12af', 'Tuition', 'School fees', 1, now()),
  ('f1000000-0000-0000-0000-000000000002', 'f3512611-7697-4838-bff0-48f9953e12af', 'Examination', 'Exam fees', 2, now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO fee_structures (id, tenant_id, category_id, amount, currency, grade_or_form, created_at)
VALUES
  (gen_random_uuid(), 'f3512611-7697-4838-bff0-48f9953e12af', 'f1000000-0000-0000-0000-000000000001', 150, 'USD', 'Form 1A', now()),
  (gen_random_uuid(), 'f3512611-7697-4838-bff0-48f9953e12af', 'f1000000-0000-0000-0000-000000000001', 175, 'USD', 'Form 2A', now()),
  (gen_random_uuid(), 'f3512611-7697-4838-bff0-48f9953e12af', 'f1000000-0000-0000-0000-000000000002', 25, 'USD', 'Form 1A', now())
ON CONFLICT DO NOTHING;

-- 10. Create timetable periods
INSERT INTO timetable_periods (id, tenant_id, name, start_time, end_time, sort_order, is_break, created_at)
VALUES
  ('g1000000-0000-0000-0000-000000000001', 'f3512611-7697-4838-bff0-48f9953e12af', 'Period 1', '08:00', '08:45', 1, false, now()),
  ('g1000000-0000-0000-0000-000000000002', 'f3512611-7697-4838-bff0-48f9953e12af', 'Period 2', '08:50', '09:35', 2, false, now()),
  ('g1000000-0000-0000-0000-000000000003', 'f3512611-7697-4838-bff0-48f9953e12af', 'Break', '09:35', '10:00', 3, true, now()),
  ('g1000000-0000-0000-0000-000000000004', 'f3512611-7697-4838-bff0-48f9953e12af', 'Period 3', '10:00', '10:45', 4, false, now()),
  ('g1000000-0000-0000-0000-000000000005', 'f3512611-7697-4838-bff0-48f9953e12af', 'Period 4', '10:50', '11:35', 5, false, now())
ON CONFLICT (id) DO NOTHING;
