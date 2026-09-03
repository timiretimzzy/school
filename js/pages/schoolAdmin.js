import { db } from "../supabaseClient.js";
import { esc, safeError, fmtDate } from "../util.js";

export async function renderSchoolAdmin(container, tenantId, section) {
  section = section || "dashboard";
  container.innerHTML = nav(section) + `<div id="school-body"></div>`;
  const body = container.querySelector("#school-body");
  if (section === "dashboard") return renderDashboard(body, tenantId);
  if (section === "academics") return renderAcademics(body, tenantId);
  if (section === "students") return renderStudents(body, tenantId);
  if (section === "staff") return renderStaff(body, tenantId);
  if (section === "announcements") return renderAnnouncements(body, tenantId);
  return renderDashboard(body, tenantId);
}

function nav(active) {
  const items = [
    ["dashboard", "Dashboard"],
    ["academics", "Academic setup"],
    ["students", "Students"],
    ["staff", "Staff & teachers"],
    ["announcements", "Announcements"],
  ];
  return `<div class="tabs">${items
    .map(([v, label]) => `<a href="#/school/${v}" class="tab ${active === v ? "active" : ""}">${label}</a>`)
    .join("")}</div>`;
}

async function renderDashboard(body, tenantId) {
  body.innerHTML = `<p class="muted">Loading school metrics…</p>`;
  const today = new Date().toISOString().slice(0, 10);
  const [students, teachers, classes, subjects, attendanceToday, upcoming, recentAnnouncements] = await Promise.all([
    db.from("students").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("status", "active"),
    db.from("tenant_memberships").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("role", "teacher").eq("active", true),
    db.from("classes").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    db.from("subjects").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    db.from("attendance_records").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("attendance_date", today),
    db.from("assessments").select("id, name, status").eq("tenant_id", tenantId).eq("status", "draft").limit(5),
    db.from("announcements").select("id, title, created_at").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(5),
  ]);
  body.innerHTML = `
    <div class="cards">
      <article>Total students<strong>${students.count ?? 0}</strong></article>
      <article>Active teachers<strong>${teachers.count ?? 0}</strong></article>
      <article>Classes<strong>${classes.count ?? 0}</strong></article>
      <article>Subjects<strong>${subjects.count ?? 0}</strong></article>
      <article>Attendance marked today<strong>${attendanceToday.count ?? 0}</strong></article>
    </div>
    <div class="panel">
      <h2>Upcoming assessments (draft)</h2>
      ${(upcoming.data || []).length ? `<ul>${upcoming.data.map((a) => `<li>${esc(a.name)}</li>`).join("")}</ul>` : `<p class="muted">None yet.</p>`}
    </div>
    <div class="panel">
      <h2>Recent announcements</h2>
      ${(recentAnnouncements.data || []).length ? `<ul>${recentAnnouncements.data.map((a) => `<li>${esc(a.title)} — ${fmtDate(a.created_at)}</li>`).join("")}</ul>` : `<p class="muted">None yet.</p>`}
    </div>`;
}

// ---------- Academic setup ----------

async function renderAcademics(body, tenantId) {
  body.innerHTML = `<div class="subtabs">
      <button data-t="years" class="active">Academic years</button>
      <button data-t="terms">Terms</button>
      <button data-t="classes">Classes</button>
      <button data-t="subjects">Subjects</button>
      <button data-t="assign">Teacher assignments</button>
      <button data-t="enrol">Student enrolments</button>
    </div>
    <div id="academics-body" class="panel"></div>`;
  const sub = body.querySelector("#academics-body");
  const buttons = body.querySelectorAll("[data-t]");
  const renderers = { years: years, terms: terms, classes: classesTab, subjects: subjectsTab, assign: assignTab, enrol: enrolTab };
  buttons.forEach((b) => {
    b.onclick = () => {
      buttons.forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      renderers[b.dataset.t](sub, tenantId);
    };
  });
  years(sub, tenantId);
}

function crudList({ title, columns, load, addFields, insert }) {
  return async (sub, tenantId) => {
    sub.innerHTML = `<h2>${title}</h2>
      <form id="add-form" class="inline-form">${addFields}<button type="submit">Add</button></form>
      <p id="crud-msg" role="status"></p>
      <div id="crud-table">Loading…</div>`;
    const table = sub.querySelector("#crud-table");
    async function refresh() {
      const { data, error } = await load(tenantId);
      if (error) {
        table.innerHTML = `<p class="error">${esc(safeError(error))}</p>`;
        return;
      }
      table.innerHTML = data.length
        ? `<table class="data"><thead><tr>${columns.map((c) => `<th>${c.label}</th>`).join("")}</tr></thead><tbody>${data
            .map((row) => `<tr>${columns.map((c) => `<td>${esc(c.render ? c.render(row) : row[c.key])}</td>`).join("")}</tr>`)
            .join("")}</tbody></table>`
        : `<p class="muted">Nothing here yet.</p>`;
    }
    sub.querySelector("#add-form").onsubmit = async (e) => {
      e.preventDefault();
      const msg = sub.querySelector("#crud-msg");
      const { error } = await insert(new FormData(e.target), tenantId);
      msg.textContent = error ? safeError(error) : "Added.";
      if (!error) {
        e.target.reset();
        refresh();
      }
    };
    refresh();
    return refresh;
  };
}

const years = crudList({
  title: "Academic years",
  columns: [{ key: "name", label: "Name" }, { key: "starts_on", label: "Starts", render: (r) => fmtDate(r.starts_on) }, { key: "ends_on", label: "Ends", render: (r) => fmtDate(r.ends_on) }, { key: "is_current", label: "Current", render: (r) => (r.is_current ? "Yes" : "No") }],
  load: (t) => db.from("academic_years").select("*").eq("tenant_id", t).order("starts_on", { ascending: false }),
  addFields: `<input name="name" placeholder="2025/2026" required><input name="starts_on" type="date"><input name="ends_on" type="date">`,
  insert: (fd, t) =>
    db.from("academic_years").insert({ tenant_id: t, name: fd.get("name"), starts_on: fd.get("starts_on") || null, ends_on: fd.get("ends_on") || null }),
});

async function terms(sub, tenantId) {
  const { data: yearsData } = await db.from("academic_years").select("id, name").eq("tenant_id", tenantId).order("starts_on", { ascending: false });
  const options = (yearsData || []).map((y) => `<option value="${y.id}">${esc(y.name)}</option>`).join("");
  return crudList({
    title: "Terms",
    columns: [{ key: "name", label: "Name" }, { key: "year", label: "Academic year", render: (r) => (yearsData || []).find((y) => y.id === r.academic_year_id)?.name || "—" }, { key: "starts_on", label: "Starts", render: (r) => fmtDate(r.starts_on) }, { key: "ends_on", label: "Ends", render: (r) => fmtDate(r.ends_on) }],
    load: (t) => db.from("terms").select("*").eq("tenant_id", t).order("starts_on", { ascending: false }),
    addFields: `<select name="academic_year_id" required><option value="">Academic year…</option>${options}</select><input name="name" placeholder="Term 1" required><input name="starts_on" type="date"><input name="ends_on" type="date">`,
    insert: (fd, t) => db.from("terms").insert({ tenant_id: t, academic_year_id: fd.get("academic_year_id"), name: fd.get("name"), starts_on: fd.get("starts_on") || null, ends_on: fd.get("ends_on") || null }),
  })(sub, tenantId);
}

async function classesTab(sub, tenantId) {
  return crudList({
    title: "Classes",
    columns: [{ key: "name", label: "Name" }],
    load: (t) => db.from("classes").select("*").eq("tenant_id", t).order("name"),
    addFields: `<input name="name" placeholder="Grade 7A" required>`,
    insert: (fd, t) => db.from("classes").insert({ tenant_id: t, name: fd.get("name") }),
  })(sub, tenantId);
}

async function subjectsTab(sub, tenantId) {
  return crudList({
    title: "Subjects",
    columns: [{ key: "name", label: "Name" }, { key: "code", label: "Code" }],
    load: (t) => db.from("subjects").select("*").eq("tenant_id", t).order("name"),
    addFields: `<input name="name" placeholder="Mathematics" required><input name="code" placeholder="MATH">`,
    insert: (fd, t) => db.from("subjects").insert({ tenant_id: t, name: fd.get("name"), code: fd.get("code") || null }),
  })(sub, tenantId);
}

async function assignTab(sub, tenantId) {
  const [{ data: teachersData }, { data: classesData }, { data: subjectsData }, { data: staffRows }] = await Promise.all([
    db.from("tenant_memberships").select("user_id").eq("tenant_id", tenantId).eq("role", "teacher").eq("active", true),
    db.from("classes").select("id, name").eq("tenant_id", tenantId).order("name"),
    db.from("subjects").select("id, name").eq("tenant_id", tenantId).order("name"),
    db.from("staff_profiles").select("user_id, first_name, last_name").eq("tenant_id", tenantId),
  ]);
  const teacherName = (uid) => {
    const s = (staffRows || []).find((x) => x.user_id === uid);
    return s ? `${s.first_name} ${s.last_name}` : uid;
  };
  const teacherOptions = (teachersData || []).map((m) => `<option value="${m.user_id}">${esc(teacherName(m.user_id))}</option>`).join("");
  const classOptions = (classesData || []).map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("");
  const subjectOptions = (subjectsData || []).map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join("");
  const classById = Object.fromEntries((classesData || []).map((c) => [c.id, c.name]));
  const subjectById = Object.fromEntries((subjectsData || []).map((s) => [s.id, s.name]));
  return crudList({
    title: "Teacher assignments",
    columns: [
      { key: "teacher", label: "Teacher", render: (r) => teacherName(r.teacher_user_id) },
      { key: "class", label: "Class", render: (r) => classById[r.class_id] || "—" },
      { key: "subject", label: "Subject", render: (r) => subjectById[r.subject_id] || "—" },
    ],
    load: (t) => db.from("teacher_assignments").select("*").eq("tenant_id", t),
    addFields: `<select name="teacher_user_id" required><option value="">Teacher…</option>${teacherOptions}</select><select name="class_id" required><option value="">Class…</option>${classOptions}</select><select name="subject_id" required><option value="">Subject…</option>${subjectOptions}</select>`,
    insert: (fd, t) => db.from("teacher_assignments").insert({ tenant_id: t, teacher_user_id: fd.get("teacher_user_id"), class_id: fd.get("class_id"), subject_id: fd.get("subject_id") }),
  })(sub, tenantId);
}

async function enrolTab(sub, tenantId) {
  const [{ data: studentsData }, { data: classesData }, { data: yearsData }] = await Promise.all([
    db.from("students").select("id, admission_number, first_name, last_name").eq("tenant_id", tenantId).eq("status", "active").order("last_name"),
    db.from("classes").select("id, name").eq("tenant_id", tenantId).order("name"),
    db.from("academic_years").select("id, name").eq("tenant_id", tenantId).order("starts_on", { ascending: false }),
  ]);
  const studentById = Object.fromEntries((studentsData || []).map((s) => [s.id, `${s.first_name} ${s.last_name} (${s.admission_number})`]));
  const classById = Object.fromEntries((classesData || []).map((c) => [c.id, c.name]));
  const yearById = Object.fromEntries((yearsData || []).map((y) => [y.id, y.name]));
  const studentOptions = (studentsData || []).map((s) => `<option value="${s.id}">${esc(studentById[s.id])}</option>`).join("");
  const classOptions = (classesData || []).map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("");
  const yearOptions = (yearsData || []).map((y) => `<option value="${y.id}">${esc(y.name)}</option>`).join("");
  return crudList({
    title: "Student enrolments",
    columns: [
      { key: "student", label: "Student", render: (r) => studentById[r.student_id] || "—" },
      { key: "class", label: "Class", render: (r) => classById[r.class_id] || "—" },
      { key: "year", label: "Academic year", render: (r) => yearById[r.academic_year_id] || "—" },
    ],
    load: (t) => db.from("student_enrolments").select("*").eq("tenant_id", t),
    addFields: `<select name="student_id" required><option value="">Student…</option>${studentOptions}</select><select name="class_id" required><option value="">Class…</option>${classOptions}</select><select name="academic_year_id" required><option value="">Academic year…</option>${yearOptions}</select>`,
    insert: (fd, t) => db.from("student_enrolments").insert({ tenant_id: t, student_id: fd.get("student_id"), class_id: fd.get("class_id"), academic_year_id: fd.get("academic_year_id") }),
  })(sub, tenantId);
}

// ---------- Students ----------

async function renderStudents(body, tenantId) {
  body.innerHTML = `
    <div class="panel">
      <div class="panel-head">
        <h2>Students</h2>
        <div class="actions">
          <input id="student-search" placeholder="Search name or admission #…">
          <select id="class-filter"><option value="">All classes</option></select>
          <select id="status-filter"><option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="graduated">Graduated</option></select>
          <button id="add-student-btn" class="primary">Add student</button>
        </div>
      </div>
      <div id="student-list">Loading…</div>
    </div>
    <div id="student-detail"></div>`;
  const { data: classesData } = await db.from("classes").select("id, name").eq("tenant_id", tenantId).order("name");
  const classFilter = body.querySelector("#class-filter");
  classFilter.innerHTML += (classesData || []).map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("");
  const list = body.querySelector("#student-list");
  const search = body.querySelector("#student-search");
  const statusFilter = body.querySelector("#status-filter");

  async function load() {
    list.textContent = "Loading…";
    let query = db.from("students").select("id, admission_number, first_name, last_name, status").eq("tenant_id", tenantId).order("last_name").limit(100);
    const term = search.value.trim();
    if (term) query = query.or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,admission_number.ilike.%${term}%`);
    if (statusFilter.value) query = query.eq("status", statusFilter.value);
    if (classFilter.value) {
      const { data: enrolled } = await db.from("student_enrolments").select("student_id").eq("tenant_id", tenantId).eq("class_id", classFilter.value);
      const ids = (enrolled || []).map((e) => e.student_id);
      query = ids.length ? query.in("id", ids) : query.eq("id", "00000000-0000-0000-0000-000000000000");
    }
    const { data, error } = await query;
    if (error) {
      list.innerHTML = `<p class="error">${esc(safeError(error))}</p>`;
      return;
    }
    list.innerHTML = data.length
      ? `<table class="data"><thead><tr><th>Admission #</th><th>Name</th><th>Status</th><th></th></tr></thead><tbody>${data
          .map((s) => `<tr><td>${esc(s.admission_number)}</td><td>${esc(s.first_name)} ${esc(s.last_name)}</td><td><span class="badge">${esc(s.status)}</span></td><td><button class="link" data-id="${s.id}">View</button></td></tr>`)
          .join("")}</tbody></table>`
      : `<p class="muted">No students match.</p>`;
    list.querySelectorAll("[data-id]").forEach((b) => (b.onclick = () => renderProfile(b.dataset.id)));
  }

  async function renderProfile(id) {
    const detail = body.querySelector("#student-detail");
    detail.innerHTML = `<p class="muted">Loading profile…</p>`;
    const [{ data: student }, { data: enrolment }, { data: attendance }, { data: results }, { data: links }] = await Promise.all([
      db.from("students").select("*").eq("id", id).single(),
      db.from("student_enrolments").select("classes(name), academic_years(name)").eq("student_id", id).limit(1).maybeSingle(),
      db.from("attendance_records").select("status").eq("student_id", id),
      db.from("assessment_results").select("mark, assessments(name, maximum_mark, status)").eq("student_id", id),
      db.from("student_links").select("relationship").eq("student_id", id),
    ]);
    const attSummary = (attendance || []).reduce((acc, a) => ({ ...acc, [a.status]: (acc[a.status] || 0) + 1 }), {});
    detail.innerHTML = `
      <div class="panel">
        <div class="panel-head">
          <h2>${esc(student.first_name)} ${esc(student.middle_name || "")} ${esc(student.last_name)}</h2>
          <button id="edit-student">Edit</button>
        </div>
        <p class="muted">Admission #${esc(student.admission_number)} • DOB ${fmtDate(student.date_of_birth)} • ${esc(student.gender || "—")} • <span class="badge">${esc(student.status)}</span></p>
        <p>Current class: ${esc(enrolment?.classes?.name || "Not enrolled")} (${esc(enrolment?.academic_years?.name || "—")})</p>
        <h3>Attendance summary</h3>
        <p>${Object.entries(attSummary).map(([k, v]) => `<span class="badge">${k}: ${v}</span>`).join(" ") || "<span class=\"muted\">No records yet.</span>"}</p>
        <h3>Assessments &amp; results</h3>
        ${(results || []).length ? `<ul>${results.map((r) => `<li>${esc(r.assessments?.name)}: ${esc(r.mark)}/${esc(r.assessments?.maximum_mark)} (${esc(r.assessments?.status)})</li>`).join("")}</ul>` : `<p class="muted">No results yet.</p>`}
        <h3>Linked parent accounts</h3>
        <p>${(links || []).length ? links.map((l) => `<span class="badge">${esc(l.relationship)}</span>`).join(" ") : `<span class="muted">None linked yet.</span>`}</p>
        <p id="student-msg" role="status"></p>
      </div>`;
    detail.querySelector("#edit-student").onclick = () => showStudentForm(tenantId, load, student, () => renderProfile(id));
  }

  body.querySelector("#add-student-btn").onclick = () => showStudentForm(tenantId, load);
  let timer;
  search.oninput = () => {
    clearTimeout(timer);
    timer = setTimeout(load, 250);
  };
  classFilter.onchange = load;
  statusFilter.onchange = load;
  load();
}

function showStudentForm(tenantId, onSaved, existing, onUpdated) {
  const overlay = document.createElement("div");
  overlay.className = "modal";
  const s = existing || {};
  overlay.innerHTML = `<div>
    <h2>${existing ? "Edit student" : "Add student"}</h2>
    <form id="student-form">
      <div class="grid">
        <label>Admission number<input name="admission_number" value="${esc(s.admission_number || "")}" required></label>
        <label>First name<input name="first_name" value="${esc(s.first_name || "")}" required></label>
        <label>Middle name<input name="middle_name" value="${esc(s.middle_name || "")}"></label>
        <label>Last name<input name="last_name" value="${esc(s.last_name || "")}" required></label>
        <label>Date of birth<input name="date_of_birth" type="date" value="${esc(s.date_of_birth || "")}"></label>
        <label>Gender<select name="gender"><option value="">—</option><option ${s.gender === "female" ? "selected" : ""}>female</option><option ${s.gender === "male" ? "selected" : ""}>male</option></select></label>
        <label>Status<select name="status"><option value="active" ${(s.status || "active") === "active" ? "selected" : ""}>active</option><option value="inactive" ${s.status === "inactive" ? "selected" : ""}>inactive</option><option value="graduated" ${s.status === "graduated" ? "selected" : ""}>graduated</option></select></label>
      </div>
      <p id="student-form-msg" role="status"></p>
      <div class="wizard-nav"><button type="button" id="cancel">Cancel</button><button type="submit" class="primary">Save</button></div>
    </form>
  </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector("#cancel").onclick = () => overlay.remove();
  overlay.querySelector("#student-form").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      admission_number: fd.get("admission_number").trim(),
      first_name: fd.get("first_name").trim(),
      middle_name: fd.get("middle_name").trim() || null,
      last_name: fd.get("last_name").trim(),
      date_of_birth: fd.get("date_of_birth") || null,
      gender: fd.get("gender") || null,
      status: fd.get("status"),
    };
    const { error } = existing
      ? await db.from("students").update(payload).eq("id", existing.id)
      : await db.from("students").insert({ tenant_id: tenantId, ...payload });
    const msg = overlay.querySelector("#student-form-msg");
    if (error) {
      msg.textContent = safeError(error);
      return;
    }
    overlay.remove();
    onSaved && onSaved();
    onUpdated && onUpdated();
  };
}

// ---------- Staff ----------

async function renderStaff(body, tenantId) {
  body.innerHTML = `<div class="panel">
      <div class="panel-head"><h2>Staff</h2></div>
      <form id="staff-form" class="inline-form">
        <input name="employee_number" placeholder="Employee #" required>
        <input name="first_name" placeholder="First name" required>
        <input name="last_name" placeholder="Last name" required>
        <input name="department" placeholder="Department">
        <input name="job_title" placeholder="Job title">
        <button type="submit">Add staff</button>
      </form>
      <p id="staff-msg" role="status"></p>
      <div id="staff-list">Loading…</div>
    </div>`;
  const list = body.querySelector("#staff-list");
  async function load() {
    const { data, error } = await db.from("staff_profiles").select("*").eq("tenant_id", tenantId).order("last_name");
    if (error) {
      list.innerHTML = `<p class="error">${esc(safeError(error))}</p>`;
      return;
    }
    list.innerHTML = data.length
      ? `<table class="data"><thead><tr><th>Employee #</th><th>Name</th><th>Department</th><th>Job title</th><th>Status</th></tr></thead><tbody>${data
          .map((s) => `<tr><td>${esc(s.employee_number || "—")}</td><td>${esc(s.first_name)} ${esc(s.last_name)}</td><td>${esc(s.department || "—")}</td><td>${esc(s.job_title || "—")}</td><td><span class="badge">${s.active ? "active" : "inactive"}</span></td></tr>`)
          .join("")}</tbody></table>`
      : `<p class="muted">No staff yet.</p>`;
  }
  body.querySelector("#staff-form").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const { error } = await db.from("staff_profiles").insert({
      tenant_id: tenantId,
      employee_number: fd.get("employee_number").trim(),
      first_name: fd.get("first_name").trim(),
      last_name: fd.get("last_name").trim(),
      department: fd.get("department").trim() || null,
      job_title: fd.get("job_title").trim() || null,
    });
    body.querySelector("#staff-msg").textContent = error ? safeError(error) : "Staff member added. Invite them from the school onboarding token or invite-user function to link an account.";
    if (!error) {
      e.target.reset();
      load();
    }
  };
  load();
}

// ---------- Announcements ----------

async function renderAnnouncements(body, tenantId) {
  body.innerHTML = `<div class="panel">
      <h2>Announcements</h2>
      <form id="ann-form" class="grid">
        <label>Title<input name="title" required></label>
        <label>Audience<select name="audience"><option value="all">Everyone</option><option value="staff">Staff</option><option value="students">Students</option><option value="parents">Parents</option></select></label>
        <label>Publish date<input name="published_at" type="datetime-local"></label>
        <label>Expiry date<input name="expires_at" type="datetime-local"></label>
        <label class="span-2">Message<textarea name="body" rows="3" required></textarea></label>
        <div><button type="submit" class="primary">Publish announcement</button></div>
      </form>
      <p id="ann-msg" role="status"></p>
      <div id="ann-list">Loading…</div>
    </div>`;
  const list = body.querySelector("#ann-list");
  async function load() {
    const { data, error } = await db.from("announcements").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false });
    if (error) {
      list.innerHTML = `<p class="error">${esc(safeError(error))}</p>`;
      return;
    }
    list.innerHTML = data.length
      ? `<table class="data"><thead><tr><th>Title</th><th>Audience</th><th>Published</th><th>Expires</th></tr></thead><tbody>${data
          .map((a) => `<tr><td>${esc(a.title)}</td><td><span class="badge">${esc(a.audience)}</span></td><td>${fmtDate(a.published_at)}</td><td>${fmtDate(a.expires_at)}</td></tr>`)
          .join("")}</tbody></table>`
      : `<p class="muted">No announcements yet.</p>`;
  }
  body.querySelector("#ann-form").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const { data: userData } = await db.auth.getUser();
    const { error } = await db.from("announcements").insert({
      tenant_id: tenantId,
      title: fd.get("title").trim(),
      body: fd.get("body").trim(),
      audience: fd.get("audience"),
      published_at: fd.get("published_at") ? new Date(fd.get("published_at")).toISOString() : new Date().toISOString(),
      expires_at: fd.get("expires_at") ? new Date(fd.get("expires_at")).toISOString() : null,
      created_by: userData?.user?.id || null,
    });
    body.querySelector("#ann-msg").textContent = error ? safeError(error) : "Announcement published.";
    if (!error) {
      e.target.reset();
      load();
    }
  };
  load();
}
