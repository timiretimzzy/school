import { db } from "../supabaseClient.js";
import { esc, fmtDate } from "../util.js";

async function getLinkedStudentId(tenantId, userId) {
  const { data } = await db.from("student_links").select("student_id").eq("tenant_id", tenantId).eq("user_id", userId).maybeSingle();
  return data?.student_id || null;
}

export async function renderStudent(container, tenantId, userId) {
  container.innerHTML = `<p class="muted">Loading your dashboard…</p>`;
  const studentId = await getLinkedStudentId(tenantId, userId);
  if (!studentId) {
    container.innerHTML = `<div class="panel"><p class="muted">Your account is not yet linked to a student record. Ask your school administrator to link your invitation to your student profile.</p></div>`;
    return;
  }
  await renderStudentSummary(container, tenantId, studentId);
}

// Shared by both the student portal and the parent portal (per selected
// child) — the query shapes are identical, only the acting identity differs
// and RLS enforces that each caller may only reach rows they are entitled to.
export async function renderStudentSummary(container, tenantId, studentId) {
  const [{ data: student }, { data: enrolment }, { data: attendance }, { data: results }, { data: announcements }] = await Promise.all([
    db.from("students").select("*").eq("id", studentId).single(),
    db.from("student_enrolments").select("classes(name), academic_years(name)").eq("student_id", studentId).limit(1).maybeSingle(),
    db.from("attendance_records").select("status").eq("student_id", studentId),
    db
      .from("assessment_results")
      .select("mark, entered_at, assessments(name, maximum_mark, status)")
      .eq("student_id", studentId)
      .order("entered_at", { ascending: false }),
    db.from("announcements").select("title, body, published_at").eq("tenant_id", tenantId).order("published_at", { ascending: false }).limit(10),
  ]);
  const attSummary = (attendance || []).reduce((acc, a) => ({ ...acc, [a.status]: (acc[a.status] || 0) + 1 }), {});
  const publishedResults = (results || []).filter((r) => r.assessments?.status === "published");
  container.innerHTML = `
    <div class="panel">
      <h2>${esc(student.first_name)} ${esc(student.last_name)}</h2>
      <p class="muted">Admission #${esc(student.admission_number)} • ${esc(enrolment?.classes?.name || "Not enrolled")} (${esc(enrolment?.academic_years?.name || "—")})</p>
    </div>
    <div class="cards">
      ${["present", "absent", "late", "excused"].map((s) => `<article>${s}<strong>${attSummary[s] || 0}</strong></article>`).join("")}
    </div>
    <div class="panel">
      <h2>Published results</h2>
      ${
        publishedResults.length
          ? `<table class="data"><thead><tr><th>Assessment</th><th>Mark</th></tr></thead><tbody>${publishedResults
              .map((r) => `<tr><td>${esc(r.assessments?.name)}</td><td>${esc(r.mark)}/${esc(r.assessments?.maximum_mark)}</td></tr>`)
              .join("")}</tbody></table>`
          : `<p class="muted">No published results yet.</p>`
      }
    </div>
    <div class="panel">
      <h2>Announcements</h2>
      ${
        (announcements || []).length
          ? `<ul>${announcements.map((a) => `<li><strong>${esc(a.title)}</strong> — ${fmtDate(a.published_at)}<br>${esc(a.body)}</li>`).join("")}</ul>`
          : `<p class="muted">No announcements right now.</p>`
      }
    </div>`;
}
