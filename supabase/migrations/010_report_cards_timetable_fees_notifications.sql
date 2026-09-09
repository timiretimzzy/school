-- Migration 010: Report cards, grading scales, timetable, fees, notifications
-- Phase 3: Core feature gaps for production use

-- ============================================================
-- 1. GRADING SCALES
-- ============================================================
CREATE TABLE IF NOT EXISTS grading_scales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,               -- e.g. "Standard A-F", "Percentage", "GPA"
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id, name)
);

CREATE TABLE IF NOT EXISTS grading_scale_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scale_id uuid NOT NULL REFERENCES grading_scales(id) ON DELETE CASCADE,
  label text NOT NULL,              -- e.g. "A", "B+", "Pass"
  min_mark numeric NOT NULL,        -- inclusive lower bound (percentage)
  max_mark numeric NOT NULL,        -- inclusive upper bound (percentage)
  gpa_points numeric DEFAULT 0,     -- GPA equivalent (0.0 - 4.0)
  sort_order int DEFAULT 0,
  UNIQUE(scale_id, label)
);

ALTER TABLE grading_scales ENABLE ROW LEVEL SECURITY;
ALTER TABLE grading_scale_levels ENABLE ROW LEVEL SECURITY;

CREATE POLICY grading_scales_read ON grading_scales
  FOR SELECT USING (has_tenant_membership(tenant_id));
CREATE POLICY grading_scales_manage ON grading_scales
  FOR ALL USING (is_admin_like(tenant_id));

CREATE POLICY grading_scale_levels_read ON grading_scale_levels
  FOR SELECT USING (has_tenant_membership((SELECT tenant_id FROM grading_scales WHERE id = scale_id)));
CREATE POLICY grading_scale_levels_manage ON grading_scale_levels
  FOR ALL USING (is_admin_like((SELECT tenant_id FROM grading_scales WHERE id = scale_id)));

-- ============================================================
-- 2. REPORT CARDS
-- ============================================================
CREATE TABLE IF NOT EXISTS report_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  academic_year_id uuid NOT NULL REFERENCES academic_years(id),
  term_id uuid REFERENCES terms(id),
  scale_id uuid REFERENCES grading_scales(id),
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'finalized', 'published')),
  overall_average numeric,
  overall_grade text,
  teacher_remarks text,
  principal_remarks text,
  generated_by uuid REFERENCES auth.users(id),
  finalized_at timestamptz,
  published_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(student_id, academic_year_id, term_id)
);

CREATE TABLE IF NOT EXISTS report_card_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_card_id uuid NOT NULL REFERENCES report_cards(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES subjects(id),
  teacher_user_id uuid REFERENCES auth.users(id),
  ca_mark numeric,                  -- continuous assessment
  exam_mark numeric,
  total_mark numeric,
  grade text,
  gpa_points numeric,
  teacher_remarks text,
  sort_order int DEFAULT 0,
  UNIQUE(report_card_id, subject_id)
);

ALTER TABLE report_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_card_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY report_cards_read ON report_cards
  FOR SELECT USING (
    has_tenant_membership(tenant_id)
    OR is_linked_student(student_id)
    OR is_linked_parent(student_id)
  );
CREATE POLICY report_cards_manage ON report_cards
  FOR ALL USING (is_admin_like(tenant_id));

CREATE POLICY report_card_lines_read ON report_card_lines
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM report_cards rc
      WHERE rc.id = report_card_id
        AND (has_tenant_membership(rc.tenant_id) OR is_linked_student(rc.student_id) OR is_linked_parent(rc.student_id))
        AND (rc.status = 'published' OR is_admin_like(rc.tenant_id))
    )
  );
CREATE POLICY report_card_lines_manage ON report_card_lines
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM report_cards rc
      WHERE rc.id = report_card_id AND is_admin_like(rc.tenant_id)
    )
  );

-- ============================================================
-- 3. TIMETABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS timetable_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,               -- e.g. "Period 1", "Break", "Lunch"
  start_time time NOT NULL,
  end_time time NOT NULL,
  sort_order int DEFAULT 0,
  is_break boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS timetable_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  academic_year_id uuid NOT NULL REFERENCES academic_years(id),
  term_id uuid REFERENCES terms(id),
  class_id uuid NOT NULL REFERENCES classes(id),
  subject_id uuid NOT NULL REFERENCES subjects(id),
  teacher_user_id uuid NOT NULL REFERENCES auth.users(id),
  period_id uuid NOT NULL REFERENCES timetable_periods(id),
  day_of_week int NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Monday
  room text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id, academic_year_id, term_id, period_id, day_of_week, class_id)
);

ALTER TABLE timetable_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE timetable_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY timetable_periods_read ON timetable_periods
  FOR SELECT USING (has_tenant_membership(tenant_id));
CREATE POLICY timetable_periods_manage ON timetable_periods
  FOR ALL USING (is_admin_like(tenant_id));

CREATE POLICY timetable_slots_read ON timetable_slots
  FOR SELECT USING (has_tenant_membership(tenant_id));
CREATE POLICY timetable_slots_manage ON timetable_slots
  FOR ALL USING (is_admin_like(tenant_id));

-- ============================================================
-- 4. FEE STRUCTURES
-- ============================================================
CREATE TABLE IF NOT EXISTS fee_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,               -- e.g. "Tuition", "Lab Fees", "Transport"
  description text,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id, name)
);

CREATE TABLE IF NOT EXISTS fee_structures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES fee_categories(id) ON DELETE CASCADE,
  academic_year_id uuid NOT NULL REFERENCES academic_years(id),
  term_id uuid REFERENCES terms(id),
  grade_id uuid REFERENCES grades_or_forms(id),
  amount numeric NOT NULL CHECK (amount >= 0),
  currency text DEFAULT 'USD',
  description text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id, category_id, academic_year_id, term_id, grade_id)
);

-- Extend fee_invoices with balance tracking
ALTER TABLE fee_invoices ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES fee_categories(id);
ALTER TABLE fee_invoices ADD COLUMN IF NOT EXISTS due_date date;
ALTER TABLE fee_invoices ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE fee_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_structures ENABLE ROW LEVEL SECURITY;

CREATE POLICY fee_categories_read ON fee_categories
  FOR SELECT USING (has_tenant_membership(tenant_id));
CREATE POLICY fee_categories_manage ON fee_categories
  FOR ALL USING (has_permission(tenant_id, 'view_finance'));

CREATE POLICY fee_structures_read ON fee_structures
  FOR SELECT USING (has_tenant_membership(tenant_id));
CREATE POLICY fee_structures_manage ON fee_structures
  FOR ALL USING (has_permission(tenant_id, 'view_finance'));

-- ============================================================
-- 5. NOTIFICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  title text NOT NULL,
  body text,
  type text DEFAULT 'info' CHECK (type IN ('info', 'warning', 'success', 'error')),
  link text,
  read_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_unread ON notifications(user_id, created_at DESC) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS notifications_tenant ON notifications(tenant_id, created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY notifications_read ON notifications
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY notifications_insert ON notifications
  FOR INSERT WITH CHECK (has_tenant_membership(tenant_id));
CREATE POLICY notifications_update ON notifications
  FOR UPDATE USING (user_id = auth.uid());

-- ============================================================
-- 6. PERFORMANCE INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS attendance_records_class_date ON attendance_records(class_id, attendance_date);
CREATE INDEX IF NOT EXISTS assessment_results_student ON assessment_results(student_id);
CREATE INDEX IF NOT EXISTS assessment_results_assessment ON assessment_results(assessment_id);
CREATE INDEX IF NOT EXISTS fee_invoices_student ON fee_invoices(student_id);
CREATE INDEX IF NOT EXISTS fee_invoices_status ON fee_invoices(tenant_id, status);
CREATE INDEX IF NOT EXISTS payments_invoice ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS announcements_feed ON announcements(tenant_id, audience, published_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_tenant_time ON audit_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS students_tenant_status ON students(tenant_id, status);
CREATE INDEX IF NOT EXISTS student_enrolments_class ON student_enrolments(class_id, academic_year_id);
