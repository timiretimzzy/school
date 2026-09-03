import { db } from "../supabaseClient.js";
import { esc, safeError, fmtDate } from "../util.js";

async function getAssignments(tenantId, userId) {
  const { data } = await db
    .from("teacher_assignments")
    .select("class_id, subject_id, classes(name), subjects(name)")
    .eq("tenant_id", tenantId)
    .eq("teacher_user_id", userId);
  return data || [];
}

export async function renderTeacher(container, tenantId, userId, section) {
  section = section || "dashboard";
  container.innerHTML = nav(section) + `<div id="teacher-body"></div>`;
  const body = container.querySelector("#teacher-body");
  if (section === "attendance") return renderAttendance(body, tenantId, userId);
  if (section === "assessments") return renderAssessments(body, tenantId, userId);
  return renderDashboard(body, tenantId, userId);
}

function nav(active) {
  const items = [
    ["dashboard", "Dashboard"],
    ["attendance", "Attendance"],
    ["assessments", "Assessments & marks"],
  ];
  return `<div class="tabs">${items
    .map(([v, label]) => `<a href="#/teacher/${v}" class="tab ${active === v ? "active" : ""}">${label}</a>`)
    .join("")}</div>`;
}

async function renderDashboard(body, tenantId, userId) {
  body.innerHTML = `<p class="muted">Loading your workspace…</p>`;
  const assignments = await getAssignments(tenantId, userId);
  const classIds = [...new Set(assignments.map((a) => a.class_id))];
  const [{ count: studentCount }, { data: draftAssessments }] = await Promise.all([
    classIds.length
      ? db.from("student_enrolments").select("student_id", { count: "exact", head: true }).eq("tenant_id", tenantId).in("class_id", classIds)
      : Promise.resolve({ count: 0 }),
    db.from("assessments").select("id, name, status").eq("tenant_id", tenantId).eq("status", "draft"),
  ]);
  body.innerHTML = `
    <div class="cards">
      <article>Assigned classes<strong>${classIds.length}</strong></article>
      <article>Assigned subjects<strong>${new Set(assignments.map((a) => a.subject_id)).size}</strong></article>
      <article>Students in your classes<strong>${studentCount ?? 0}</strong></article>
      <article>Draft assessments<strong>${(draftAssessments || []).length}</strong></article>
    </div>
    <div class="panel">
      <h2>Your assignments</h2>
      ${
        assignments.length
          ? `<table class="data"><thead><tr><th>Class</th><th>Subject</th></tr></thead><tbody>${assignments
              .map((a) => `<tr><td>${esc(a.classes?.name || "—")}</td><td>${esc(a.subjects?.name || "—")}</td></tr>`)
              .join("")}</tbody></table>`
          : `<p class="muted">You have no class assignments yet. Ask your school administrator to assign you to a class and subject.</p>`
      }
    </div>`;
}

async function renderAttendance(body, tenantId, userId) {
  const assignments = await getAssignments(tenantId, userId);
  const classes = [...new Map(assignments.map((a) => [a.class_id, a.classes?.name])).entries()];
  body.innerHTML = `<div class="panel">
      <h2>Record attendance</h2>
      ${classes.length ? "" : '<p class="muted">You have no assigned classes.</p>'}
      <div class="inline-form">
        <select id="att-class"><option value="">Select a class…</option>${classes.map(([id, name]) => `<option value="${id}">${esc(name)}</option>`).join("")}</select>
        <input id="att-date" type="date" value="${new Date().toISOString().slice(0, 10)}">
        <button id="att-load">Load students</button>
      </div>
      <p id="att-msg" role="status"></p>
      <div id="att-list"></div>
    </div>`;
  body.querySelector("#att-load").onclick = async () => {
    const classId = body.querySelector("#att-class").value;
    const date = body.querySelector("#att-date").value;
    const msg = body.querySelector("#att-msg");
    const list = body.querySelector("#att-list");
    if (!classId || !date) {
      msg.textContent = "Select a class and a date.";
      return;
    }
    const { data: enrolled, error } = await db
      .from("student_enrolments")
      .select("student_id, students(first_name, last_name, admission_number)")
      .eq("tenant_id", tenantId)
      .eq("class_id", classId);
    if (error) {
      msg.textContent = safeError(error);
      return;
    }
    const { data: existing } = await db.from("attendance_records").select("student_id, status").eq("tenant_id", tenantId).eq("attendance_date", date);
    const existingByStudent = Object.fromEntries((existing || []).map((r) => [r.student_id, r.status]));
    msg.textContent = "";
    list.innerHTML = enrolled.length
      ? `<form id="att-form"><table class="data"><thead><tr><th>Student</th><th>Present</th><th>Absent</th><th>Late</th><th>Excused</th></tr></thead><tbody>${enrolled
          .map((e) => {
            const current = existingByStudent[e.student_id] || "present";
            return `<tr><td>${esc(e.students?.first_name)} ${esc(e.students?.last_name)} (${esc(e.students?.admission_number)})</td>${["present", "absent", "late", "excused"]
              .map((st) => `<td><input type="radio" name="s-${esc(e.student_id)}" value="${st}" ${current === st ? "checked" : ""}></td>`)
              .join("")}</tr>`;
          })
          .join("")}</tbody></table><input type="hidden" name="class_id" value="${esc(classId)}"><input type="hidden" name="date" value="${esc(date)}"><button type="submit" class="primary">Save attendance</button></form>`
      : `<p class="muted">No students are enrolled in this class yet.</p>`;
    const form = list.querySelector("#att-form");
    if (form) {
      form.onsubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const rows = enrolled.map((en) => ({
          tenant_id: tenantId,
          student_id: en.student_id,
          class_id: classId,
          attendance_date: date,
          status: fd.get(`s-${en.student_id}`) || "present",
          recorded_by: userId,
        }));
        const { error: saveError } = await db.from("attendance_records").upsert(rows, { onConflict: "tenant_id,student_id,attendance_date" });
        msg.textContent = saveError ? safeError(saveError) : "Attendance saved.";
      };
    }
  };
}

async function renderAssessments(body, tenantId, userId) {
  const assignments = await getAssignments(tenantId, userId);
  const classes = [...new Map(assignments.map((a) => [a.class_id, a.classes?.name])).entries()];
  const { data: terms } = await db.from("terms").select("id, name").eq("tenant_id", tenantId).order("starts_on", { ascending: false });
  body.innerHTML = `<div class="panel">
      <h2>Create assessment</h2>
      <form id="create-assess" class="grid">
        <label>Class<select name="class_id" required><option value="">Select…</option>${classes.map(([id, name]) => `<option value="${id}">${esc(name)}</option>`).join("")}</select></label>
        <label>Subject<select name="subject_id" required><option value="">Select a class first…</option></select></label>
        <label>Term<select name="term_id"><option value="">—</option>${(terms || []).map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join("")}</select></label>
        <label>Assessment name<input name="name" required placeholder="Mid-term test"></label>
        <label>Maximum mark<input name="maximum_mark" type="number" min="1" value="100" required></label>
        <label>Weighting (%)<input name="weighting" type="number" min="0" max="100"></label>
        <div><button type="submit" class="primary">Create assessment</button></div>
      </form>
      <p id="assess-msg" role="status"></p>
    </div>
    <div class="panel">
      <h2>Enter marks</h2>
      <div class="inline-form">
        <select id="assess-select"><option value="">Select an assessment…</option></select>
        <button id="assess-load">Load students</button>
      </div>
      <p id="marks-msg" role="status"></p>
      <div id="marks-list"></div>
    </div>`;

  const classSelect = body.querySelector('select[name="class_id"]');
  const subjectSelect = body.querySelector('select[name="subject_id"]');
  classSelect.onchange = () => {
    const subs = assignments.filter((a) => a.class_id === classSelect.value);
    subjectSelect.innerHTML = subs.length
      ? `<option value="">Select…</option>${subs.map((s) => `<option value="${s.subject_id}">${esc(s.subjects?.name || "—")}</option>`).join("")}`
      : `<option value="">No subjects assigned for this class</option>`;
  };

  const assessSelect = body.querySelector("#assess-select");
  async function refreshAssessments() {
    const classIds = classes.map(([id]) => id);
    if (!classIds.length) return;
    const { data } = await db.from("assessments").select("id, name, status, class_id, subject_id, maximum_mark").eq("tenant_id", tenantId).in("class_id", classIds);
    assessSelect.innerHTML =
      `<option value="">Select an assessment…</option>` +
      (data || []).map((a) => `<option value="${a.id}" data-max="${a.maximum_mark}" data-class="${a.class_id}">${esc(a.name)} (${esc(a.status)})</option>`).join("");
  }
  await refreshAssessments();

  body.querySelector("#create-assess").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const msg = body.querySelector("#assess-msg");
    const { error } = await db.from("assessments").insert({
      tenant_id: tenantId,
      class_id: fd.get("class_id"),
      subject_id: fd.get("subject_id"),
      term_id: fd.get("term_id") || null,
      name: fd.get("name").trim(),
      maximum_mark: Number(fd.get("maximum_mark")),
      weighting: fd.get("weighting") ? Number(fd.get("weighting")) : null,
    });
    msg.textContent = error ? safeError(error) : "Assessment created.";
    if (!error) {
      e.target.reset();
      refreshAssessments();
    }
  };

  body.querySelector("#assess-load").onclick = async () => {
    const opt = assessSelect.selectedOptions[0];
    const msg = body.querySelector("#marks-msg");
    const list = body.querySelector("#marks-list");
    if (!assessSelect.value) {
      msg.textContent = "Select an assessment.";
      return;
    }
    const classId = opt.dataset.class;
    const maxMark = Number(opt.dataset.max);
    const { data: enrolled, error } = await db
      .from("student_enrolments")
      .select("student_id, students(first_name, last_name, admission_number)")
      .eq("tenant_id", tenantId)
      .eq("class_id", classId);
    if (error) {
      msg.textContent = safeError(error);
      return;
    }
    const { data: existing } = await db.from("assessment_results").select("student_id, mark").eq("assessment_id", assessSelect.value);
    const marksByStudent = Object.fromEntries((existing || []).map((r) => [r.student_id, r.mark]));
    msg.textContent = "";
    list.innerHTML = enrolled.length
      ? `<form id="marks-form"><table class="data"><thead><tr><th>Student</th><th>Mark (max ${esc(maxMark)})</th></tr></thead><tbody>${enrolled
          .map(
            (e) =>
              `<tr><td>${esc(e.students?.first_name)} ${esc(e.students?.last_name)} (${esc(e.students?.admission_number)})</td><td><input type="number" min="0" max="${esc(maxMark)}" step="0.5" name="m-${esc(e.student_id)}" value="${esc(marksByStudent[e.student_id] ?? "")}"></td></tr>`,
          )
          .join("")}</tbody></table>
        <div class="wizard-nav"><button type="submit">Save draft</button><button type="button" id="publish-btn" class="primary">Publish results</button></div></form>`
      : `<p class="muted">No students enrolled in this class.</p>`;
    const form = list.querySelector("#marks-form");
    if (!form) return;
    async function saveMarks() {
      const fd = new FormData(form);
      const rows = [];
      for (const en of enrolled) {
        const raw = fd.get(`m-${en.student_id}`);
        if (raw === null || raw === "") continue;
        const mark = Number(raw);
        if (Number.isNaN(mark) || mark < 0 || mark > maxMark) {
          msg.textContent = `Mark for ${en.students?.first_name} must be between 0 and ${maxMark}.`;
          return false;
        }
        rows.push({ tenant_id: tenantId, assessment_id: assessSelect.value, student_id: en.student_id, mark, entered_by: userId });
      }
      if (!rows.length) return true;
      const { error: saveError } = await db.from("assessment_results").upsert(rows, { onConflict: "assessment_id,student_id" });
      if (saveError) {
        msg.textContent = safeError(saveError);
        return false;
      }
      return true;
    }
    form.onsubmit = async (e2) => {
      e2.preventDefault();
      if (await saveMarks()) msg.textContent = "Marks saved as draft.";
    };
    form.querySelector("#publish-btn").onclick = async () => {
      if (!(await saveMarks())) return;
      const { error: pubError } = await db.from("assessments").update({ status: "published" }).eq("id", assessSelect.value);
      msg.textContent = pubError ? safeError(pubError) : "Results published. Students and parents can now see them.";
      if (!pubError) refreshAssessments();
    };
  };
}
