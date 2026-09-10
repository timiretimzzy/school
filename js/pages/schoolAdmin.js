import { db } from "../supabaseClient.js";
import { esc, safeError, fmtDate, parseCSV, isValidEmail } from "../util.js";

export async function renderSchoolAdmin(container, tenantId, section) {
  section = section || "dashboard";
  container.innerHTML = nav(section) + `<div id="school-body"></div>`;
  const body = container.querySelector("#school-body");
  if (section === "dashboard") return renderDashboard(body, tenantId);
  if (section === "academics") return renderAcademics(body, tenantId);
  if (section === "students") return renderStudents(body, tenantId);
  if (section === "staff") return renderStaff(body, tenantId);
  if (section === "announcements") return renderAnnouncements(body, tenantId);
  if (section === "report-cards") return renderReportCards(body, tenantId);
  if (section === "timetable") return renderTimetable(body, tenantId);
  if (section === "finance") return renderFinance(body, tenantId);
  return renderDashboard(body, tenantId);
}

function nav(active) {
  const items = [
    ["dashboard", "Dashboard"],
    ["academics", "Academic setup"],
    ["students", "Students"],
    ["staff", "Staff & teachers"],
    ["report-cards", "Report cards"],
    ["timetable", "Timetable"],
    ["finance", "Finance"],
    ["announcements", "Announcements"],
  ];
  return `<div class="tabs">${items
    .map(([v, label]) => `<a href="#/school/${v}" class="tab ${active === v ? "active" : ""}">${label}</a>`)
    .join("")}</div>`;
}

async function renderDashboard(body, tenantId) {
  body.innerHTML = `<p class="muted">Loading school metrics…</p>`;
  const today = new Date().toISOString().slice(0, 10);
  const [students, teachers, classes, subjects, attendanceToday, upcoming, recentAnnouncements, pendingInvites] = await Promise.all([
    db.from("students").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("status", "active"),
    db.from("tenant_memberships").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("role", "teacher").eq("active", true),
    db.from("classes").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    db.from("subjects").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    db.from("attendance_records").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("attendance_date", today),
    db.from("assessments").select("id, name, status").eq("tenant_id", tenantId).eq("status", "draft").limit(5),
    db.from("announcements").select("id, title, created_at").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(5),
    db.from("tenant_invitations").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).is("accepted_at", null).gt("expires_at", new Date().toISOString()),
  ]);
  body.innerHTML = `
    <div class="cards">
      <article>Total students<strong>${students.count ?? 0}</strong></article>
      <article>Active teachers<strong>${teachers.count ?? 0}</strong></article>
      <article>Classes<strong>${classes.count ?? 0}</strong></article>
      <article>Subjects<strong>${subjects.count ?? 0}</strong></article>
      <article>Attendance marked today<strong>${attendanceToday.count ?? 0}</strong></article>
      <article>Pending invitations<strong>${pendingInvites.count ?? 0}</strong></article>
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
          <button id="download-student-csv-btn" class="secondary">Download CSV template</button>
          <button id="import-student-csv-btn" class="primary">Import CSV</button>
          <button id="invite-all-students-btn" class="primary">Invite All Eligible</button>
        </div>
      </div>
      <p id="student-msg" role="status"></p>
      <div id="student-list">Loading…</div>
    </div>
    <div id="student-detail"></div>`;
  const { data: classesData } = await db.from("classes").select("id, name").eq("tenant_id", tenantId).order("name");
  const classFilter = body.querySelector("#class-filter");
  classFilter.innerHTML += (classesData || []).map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("");
  const list = body.querySelector("#student-list");
  const search = body.querySelector("#student-search");
  const statusFilter = body.querySelector("#status-filter");
  body.querySelector("#download-student-csv-btn").onclick = downloadStudentCsvTemplate;
  body.querySelector("#import-student-csv-btn").onclick = () => importStudentsCsv(tenantId, list, load, true);
  body.querySelector("#invite-all-students-btn").onclick = () => inviteAllStudents(tenantId, load);

  async function load() {
    list.textContent = "Loading…";
    let query = db.from("students").select("id, admission_number, first_name, last_name, email, status").eq("tenant_id", tenantId).order("last_name").limit(100);
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
    // Fetch invitation + link data for status.
    const [{ data: invitations }, { data: links }] = await Promise.all([
      db.from("tenant_invitations").select("email, role, accepted_at, expires_at").eq("tenant_id", tenantId).is("accepted_at", null),
      db.from("student_links").select("student_id").eq("tenant_id", tenantId),
    ]);
    const linkedIds = new Set((links || []).map((l) => l.student_id));
    const pendingByStudent = {};
    const expiredByStudent = {};
    (invitations || []).forEach((inv) => {
      const sid = inv.metadata?.student_id;
      if (!sid) return;
      if (new Date(inv.expires_at) > new Date()) {
        pendingByStudent[sid] = inv;
      } else {
        expiredByStudent[sid] = inv;
      }
    });

    list.innerHTML = data.length
      ? `<table class="data"><thead><tr><th>Admission #</th><th>Name</th><th>Email</th><th>Invitation status</th><th></th></tr></thead><tbody>${data
          .map((s) => {
            const st = studentInviteStatus(s, linkedIds.has(s.id), pendingByStudent[s.id], expiredByStudent[s.id]);
            return `<tr><td>${esc(s.admission_number)}</td><td>${esc(s.first_name)} ${esc(s.last_name)}</td><td>${esc(s.email || "")}</td><td><span class="badge ${st.cls}">${st.label}</span></td><td>${st.inviteBtn}</td></tr>`;
          })
          .join("")}</tbody></table>`
      : `<p class="muted">No students match.</p>`;
    list.querySelectorAll("[data-student-id]").forEach((btn) => {
      btn.onclick = () => inviteStudent(tenantId, btn.dataset, () => load());
    });
  }

  async function renderProfile(id) {
    const detail = body.querySelector("#student-detail");
    detail.innerHTML = `<p class="muted">Loading profile…</p>`;
    const [{ data: student }, { data: enrolment }, { data: attendance }, { data: results }, { data: links }] = await Promise.all([
      db.from("students").select("*").eq("id", id).eq("tenant_id", tenantId).single(),
      db.from("student_enrolments").select("classes(name), academic_years(name)").eq("student_id", id).eq("tenant_id", tenantId).limit(1).maybeSingle(),
      db.from("attendance_records").select("status").eq("student_id", id).eq("tenant_id", tenantId),
      db.from("assessment_results").select("mark, assessments(name, maximum_mark, status)").eq("student_id", id).eq("tenant_id", tenantId),
      db.from("student_links").select("relationship").eq("student_id", id).eq("tenant_id", tenantId),
    ]);
    const attSummary = (attendance || []).reduce((acc, a) => ({ ...acc, [a.status]: (acc[a.status] || 0) + 1 }), {});
    detail.innerHTML = `
      <div class="panel">
        <div class="panel-head">
          <h2>${esc(student.first_name)} ${esc(student.middle_name || "")} ${esc(student.last_name)}</h2>
          <button id="edit-student">Edit</button>
        </div>
        <p class="muted">Admission #${esc(student.admission_number)} • DOB ${fmtDate(student.date_of_birth)} • ${esc(student.gender || "—")} • ${esc(student.email || "—")} • <span class="badge">${esc(student.status)}</span></p>
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

// Invitation status helper for students — based on real DB relationships.
function studentInviteStatus(student, isLinked, pendingInvite, expiredInvite) {
  if (isLinked) {
    return { label: "ACTIVE", cls: "active", inviteBtn: `<span class="muted">linked</span>` };
  }
  if (!student.email) {
    return { label: "NO EMAIL", cls: "trial", inviteBtn: `<span class="muted">no email</span>` };
  }
  if (pendingInvite) {
    return { label: "INVITED", cls: "", inviteBtn: `<span class="muted">invited</span>` };
  }
  if (expiredInvite) {
    return { label: "INVITATION EXPIRED", cls: "suspended", inviteBtn: `<button class="link" data-student-id="${student.id}" data-email="${esc(student.email)}" data-name="${esc(student.first_name)} ${esc(student.last_name)}">Re-invite</button>` };
  }
  return { label: "NOT INVITED", cls: "", inviteBtn: `<button class="link" data-student-id="${student.id}" data-email="${esc(student.email)}" data-name="${esc(student.first_name)} ${esc(student.last_name)}">Invite</button>` };
}

// Invite a single student — calls the secure invite-user Edge Function.
// No raw token is ever displayed.
async function inviteStudent(tenantId, ds, onDone) {
  const overlay = document.createElement("div");
  overlay.className = "modal";
  overlay.innerHTML = `<div>
      <h2>Invite ${ds.name || ""}?</h2>
      <p class="muted">An invitation will be sent to <strong>${esc(ds.email)}</strong> with the role <strong>student</strong>.</p>
      <form id="invite-student-form" class="grid">
        <div><button type="button" id="cancel">Cancel</button><button type="submit" class="primary" id="invite-btn">Send invitation</button></div>
      </form>
      <p id="invite-student-msg" role="status"></p>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector("#cancel").onclick = () => overlay.remove();
  overlay.querySelector("#invite-student-form").onsubmit = async (e) => {
    e.preventDefault();
    const msg = overlay.querySelector("#invite-student-msg");
    const btn = overlay.querySelector("#invite-btn");
    msg.textContent = "Sending invitation…";
    btn.disabled = true;
    btn.textContent = "Sending…";
    const { data, error } = await db.functions.invoke("invite-user", {
      body: { tenant_id: tenantId, email: ds.email, role: "student", student_id: ds.studentId },
    });
    if (error) {
      msg.textContent = safeError(error);
      btn.disabled = false;
      btn.textContent = "Send invitation";
      return;
    }
    if (data?.error) {
      msg.textContent = `Invitation error: ${esc(data.error)}`;
      btn.disabled = false;
      btn.textContent = "Send invitation";
      return;
    }
    // Development/testing delivery: show acceptance URL so the invitee can
    // accept the invitation without email delivery being configured.
    if (data.testing_delivery) {
      msg.innerHTML = `
        <p><span class="badge active">Invitation sent</span></p>
        <p><strong>Development/Testing Delivery:</strong> The invitation has been created in the database.</p>
        <p>Acceptance URL: <code class="url-code">${esc(data.acceptance_url)}</code></p>
        <button id="copy-link-btn" class="primary">Copy invitation link</button>
        <p class="muted small">This link navigates to the acceptance page where the invited user can create/log into their account.</p>
      `;
      // Add copy-to-clipboard functionality
      const copyBtn = overlay.querySelector("#copy-link-btn");
      if (copyBtn) {
        copyBtn.onclick = async () => {
          try {
            await navigator.clipboard.writeText(data.acceptance_url);
            msg.textContent = "Link copied to clipboard!";
          } catch {
            msg.textContent = "Failed to copy link.";
          }
          setTimeout(() => {
            msg.textContent = "";
            // Keep overlay open so the admin can still copy manually
          }, 2000);
        };
      }
    } else {
      msg.innerHTML = `<p><span class="badge active">Invitation sent</span> ${esc(data.message || "The invitation has been created and will be delivered to the invitee.")}</p>`;
    }
    setTimeout(() => { overlay.remove(); onDone && onDone(); }, 1500);
  };
}

// Invite all eligible students — sequential batch processing with progress.
// A student is eligible if: has a valid email, no linked student_links,
// and no active pending invitation. The tenant_memberships check for
// student role is also performed as an additional safety layer.
async function inviteAllStudents(tenantId, onReload) {
  const [{ data: students }, { data: invitations }, { data: links }, { data: studentMemberships }] = await Promise.all([
    db.from("students").select("id, first_name, last_name, email").eq("tenant_id", tenantId).not("email", "is", null),
    db.from("tenant_invitations").select("email, role, accepted_at, expires_at, metadata").eq("tenant_id", tenantId).is("accepted_at", null),
    db.from("student_links").select("student_id, user_id").eq("tenant_id", tenantId),
    db.from("tenant_memberships").select("user_id").eq("tenant_id", tenantId).eq("role", "student").eq("active", true),
  ]);

  const linkedIds = new Set((links || []).map((l) => l.student_id));
  // Build a set of user_ids from student memberships to cross-reference
  const studentAuthUserIds = new Set((studentMemberships || []).map((m) => m.user_id));
  // Exclude students whose user_id is in studentAuthUserIds by finding
  // their student_ids via student_links (which maps student_id -> user_id).
  // This ensures students with an active tenant_memberships entry are
  // never invited, even if they lack a student_links row.
  studentAuthUserIds.forEach((uid) => {
    const linkedStudent = (links || []).find((l) => l.user_id === uid);
    if (linkedStudent) linkedIds.add(linkedStudent.student_id);
  });
  const pendingStudentIds = new Set();
  (invitations || []).forEach((inv) => {
    if (inv.role === "student" && inv.metadata?.student_id && new Date(inv.expires_at) > new Date()) {
      pendingStudentIds.add(inv.metadata.student_id);
    }
  });

  // A student is eligible if they have no student_links AND no pending invitation
  // AND no active tenant_memberships entry (checked via cross-reference above).
  const eligible = (students || []).filter((s) => {
    if (linkedIds.has(s.id)) return false;
    if (pendingStudentIds.has(s.id)) return false;
    return true;
  });

  if (!eligible.length) {
    toast("No eligible students found.", "error");
    return;
  }

  confirmAction("Invite all eligible students?", `You are about to invite ${eligible.length} student(s).`, async () => {

  const overlay = document.createElement("div");
  overlay.className = "modal";
  overlay.innerHTML = `<div>
      <h2>Inviting students…</h2>
      <p id="invite-all-student-progress" class="muted">Starting invitation batch…</p>
      <div id="invite-all-student-results"></div>
      <div class="wizard-nav"><button type="button" id="close-modal" class="link">Close</button></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector("#close-modal").onclick = () => overlay.remove();

  const progress = overlay.querySelector("#invite-all-student-progress");
  const resultsEl = overlay.querySelector("#invite-all-student-results");
  let sent = 0, failed = 0;
  const failedList = [];

  for (let i = 0; i < eligible.length; i++) {
    const student = eligible[i];
    progress.textContent = `Inviting ${i + 1} of ${eligible.length}: ${student.first_name} ${student.last_name} (${student.email})`;
    const { data, error } = await db.functions.invoke("invite-user", {
      body: { tenant_id: tenantId, email: student.email, role: "student", student_id: student.id },
    });
    if (error || data?.error) {
      failed++;
      failedList.push(`${student.first_name} ${student.last_name} (${student.email}): ${error?.message || data?.error || "unknown error"}`);
    } else {
      sent++;
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  progress.textContent = `Complete`;
  const skippedByLink = (students || []).filter((s) => linkedIds.has(s.id)).length;
  const skippedByPending = (students || []).filter((s) => pendingStudentIds.has(s.id)).length;
  const skippedCount = skippedByLink + skippedByPending;
  resultsEl.innerHTML = `
    <div class="cards">
      <article>Invitations sent<strong>${sent}</strong></article>
      <article>Skipped<strong>${skippedCount}</strong></article>
      <article>Failed<strong>${failed}</strong></article>
    </div>
    ${failedList.length ? `<details><summary>Failed invitations (${failedList.length})</summary><ul>${failedList.map((f) => `<li>${esc(f)}</li>`).join("")}</ul></details>` : ""}
    <p class="muted small">Skipped: ${skippedByLink} already have a student link, ${skippedByPending} already have a pending invitation.</p>
  `;
  setTimeout(() => onReload && onReload(), 1000);
  });
}

function downloadStudentCsvTemplate() {
  const headers = ["admission_number", "first_name", "middle_name", "last_name", "email", "date_of_birth", "gender", "phone", "guardian_name", "guardian_phone"];
  const sample = ["DHS-004", "Ife", "Sunday", "Okonkwo", "ife.okonkwo@school.demo", "2010-05-01", "female", "08012345678", "Mrs Nneka Okonkwo", "08087654321"];
  const csv = [headers.join(","), sample.join(",")].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "student_import_template.csv";
  a.click();
  URL.revokeObjectURL(url);
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
        <label>Email<input name="email" type="email" placeholder="student@school.demo" value="${esc(s.email || "")}"></label>
        <label>Password<input name="password" type="password" placeholder="Min 8 chars, upper+lower+digit+special" ${existing ? "" : "required"}></label>
        <label>Date of birth<input name="date_of_birth" type="date" value="${esc(s.date_of_birth || "")}"></label>
        <label>Gender<select name="gender"><option value="">—</option><option ${s.gender === "female" ? "selected" : ""}>female</option><option ${s.gender === "male" ? "selected" : ""}>male</option><option ${s.gender === "other" ? "selected" : ""}>other</option></select></label>
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
    const msg = overlay.querySelector("#student-form-msg");
    const btn = e.target.querySelector("button[type=submit]");
    const email = fd.get("email").trim() || null;
    const password = fd.get("password") || undefined;
    btn.disabled = true;
    msg.innerHTML = `<span class="spinner sm"></span> Creating account…`;
    const { data, error } = await db.functions.invoke("create-account", {
      body: { tenant_id: tenantId, email, role: "student", password },
    });
    if (error) { msg.textContent = safeError(error); btn.disabled = false; return; }
    if (data?.error) { msg.textContent = `Error: ${esc(data.error)}`; btn.disabled = false; return; }
    const loginId = data.login_id;
    msg.innerHTML = `<div class="panel" style="text-align:center;padding:20px">
      <h3>Student Account Created</h3>
      <p class="muted">Share these credentials with the student:</p>
      <div style="background:#f4f7fb;padding:16px;border-radius:8px;margin:12px 0;font-family:monospace;font-size:16px">
        <div><strong>Login ID:</strong> ${esc(loginId)}</div>
      </div>
      <p class="muted small">The student must change their password on first login.</p>
    </div>`;
    setTimeout(() => { overlay.remove(); onSaved && onSaved(); onUpdated && onUpdated(); }, 4000);
  };
}

// ---------- Staff ----------

const STAFF_INVITE_ROLES = [
  ["teacher", "Teacher"],
  ["finance_officer", "Finance officer"],
  ["librarian", "Librarian"],
  ["registrar", "Registrar"],
  ["principal", "Principal"],
];

// Build staff list with real invitation status and invite buttons.
// Status is determined from real DB relationships:
//   - staff_profiles.user_id (linked auth user)
//   - tenant_memberships (active membership for that user_id)
//   - tenant_invitations (pending or expired invitation matched by email)
async function renderStaff(body, tenantId) {
  body.innerHTML = `<div class="panel">
      <div class="panel-head">
        <h2>Staff</h2>
        <div class="actions">
          <button id="download-staff-csv-btn" class="secondary">Download CSV template</button>
          <button id="import-staff-csv-btn" class="primary">Import CSV</button>
          <button id="invite-all-teachers-btn" class="primary">Invite All Eligible Teachers</button>
        </div>
      </div>
      <form id="staff-form" class="inline-form">
        <input name="employee_number" placeholder="Employee #" required>
        <input name="first_name" placeholder="First name" required>
        <input name="last_name" placeholder="Last name" required>
        <input name="email" type="email" placeholder="Email (for invitation)">
        <input name="password" type="password" placeholder="Password (min 8 chars)">
        <input name="department" placeholder="Department">
        <input name="job_title" placeholder="Job title">
        <button type="submit">Add staff</button>
      </form>
      <p id="staff-msg" role="status"></p>
      <div id="staff-list">Loading…</div>
    </div>`;
  const list = body.querySelector("#staff-list");
  body.querySelector("#download-staff-csv-btn").onclick = downloadStaffCsvTemplate;
  body.querySelector("#import-staff-csv-btn").onclick = () => importStaffCsv(tenantId, list, load);
  body.querySelector("#invite-all-teachers-btn").onclick = () => inviteAllTeachers(tenantId, load);

  async function load() {
    const [profiles, memberships, invitations] = await Promise.all([
      db.from("staff_profiles").select("*").eq("tenant_id", tenantId).order("last_name"),
      db.from("tenant_memberships").select("user_id, role").eq("tenant_id", tenantId).eq("active", true),
      db.from("tenant_invitations").select("email, role, accepted_at, expires_at").eq("tenant_id", tenantId).is("accepted_at", null),
    ]);

    const linkedUserIds = new Set((memberships.data || []).map((m) => m.user_id));
    const pendingByEmail = {};
    const expiredByEmail = {};
    (invitations.data || []).forEach((inv) => {
      const email = (inv.email || "").toLowerCase();
      if (new Date(inv.expires_at) > new Date()) {
        pendingByEmail[email] = (pendingByEmail[email] || 0) + 1;
      } else {
        expiredByEmail[email] = (expiredByEmail[email] || 0) + 1;
      }
    });

    const data = profiles.data || [];
    if (profiles.error) {
      list.innerHTML = `<p class="error">${esc(safeError(profiles.error))}</p>`;
      return;
    }
    list.innerHTML = data.length
      ? `<table class="data"><thead><tr><th>Employee #</th><th>Name</th><th>Email</th><th>Invitation status</th><th>Invited at</th><th>Department</th><th>Job title</th><th></th></tr></thead><tbody>${data
          .map((s) => {
            const isLinked = linkedUserIds.has(s.user_id);
            const st = staffInviteStatus(s, isLinked, pendingByEmail, expiredByEmail);
            return `<tr><td>${esc(s.employee_number || "—")}</td><td>${esc(s.first_name)} ${esc(s.last_name)}</td><td>${esc(s.email || "")}</td><td><span class="badge ${st.cls}">${st.label}</span></td><td>${s.last_invited_at ? fmtDate(s.last_invited_at) : "<span class=\"muted\">—</span>"}</td><td>${esc(s.department || "—")}</td><td>${esc(s.job_title || "—")}</td><td>${st.inviteBtn}</td></tr>`;
          })
          .join("")}</tbody></table>`
      : `<p class="muted">No staff yet.</p>`;
    // Wire up Invite buttons.
    list.querySelectorAll("[data-staff-id]").forEach((btn) => {
      btn.onclick = () => openInviteModal(tenantId, btn.dataset, () => load());
    });
  }

  body.querySelector("#staff-form").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const msg = body.querySelector("#staff-msg");
    const btn = e.target.querySelector("button[type=submit]");
    const email = fd.get("email").trim();
    const password = fd.get("password") || undefined;
    btn.disabled = true;
    msg.innerHTML = `<span class="spinner sm"></span> Creating account…`;
    const { data, error } = await db.functions.invoke("create-account", {
      body: { tenant_id: tenantId, email, role: "teacher", password },
    });
    if (error) { msg.textContent = safeError(error); btn.disabled = false; return; }
    if (data?.error) { msg.textContent = `Error: ${esc(data.error)}`; btn.disabled = false; return; }
    const loginId = data.login_id;
    msg.innerHTML = `<div class="panel" style="text-align:center;padding:20px">
      <h3>Teacher Account Created</h3>
      <p class="muted">Share these credentials with the teacher:</p>
      <div style="background:#f4f7fb;padding:16px;border-radius:8px;margin:12px 0;font-family:monospace;font-size:16px">
        <div><strong>Login ID:</strong> ${esc(loginId)}</div>
      </div>
      <p class="muted small">The teacher must change their password on first login.</p>
    </div>`;
    e.target.reset();
    btn.disabled = false;
    load();
  };
  load();
}

// Invitation status helper for staff — based on real DB relationships.
function staffInviteStatus(staff, isLinked, pendingByEmail, expiredByEmail) {
  if (isLinked) {
    return { label: "ACTIVE", cls: "active", inviteBtn: `<span class="muted">linked</span>` };
  }
  if (!staff.email) {
    return { label: "NO EMAIL", cls: "trial", inviteBtn: `<span class="muted">no email</span>` };
  }
  if (pendingByEmail[staff.email.toLowerCase()]) {
    return { label: "INVITED", cls: "", inviteBtn: `<span class="muted">invited</span>` };
  }
  if (expiredByEmail[staff.email.toLowerCase()]) {
    return { label: "INVITATION EXPIRED", cls: "suspended", inviteBtn: `<button class="link" data-staff-id="${staff.id}" data-email="${esc(staff.email)}" data-name="${esc(staff.first_name)} ${esc(staff.last_name)}">Re-invite</button>` };
  }
  return { label: "NOT INVITED", cls: "", inviteBtn: `<button class="link" data-staff-id="${staff.id}" data-email="${esc(staff.email)}" data-name="${esc(staff.first_name)} ${esc(staff.last_name)}">Invite</button>` };
}

function downloadStaffCsvTemplate() {
  const headers = ["employee_number", "first_name", "middle_name", "last_name", "email", "phone", "department", "job_title"];
  const sample = ["EMP-003", "Adewale", "James", "Sunday", "adewale@school.demo", "08012345678", "Administration", "Registrar"];
  const csv = [headers.join(","), sample.join(",")].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "staff_import_template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// Invite All Eligible Teachers — sequential batch processing with progress.
// A teacher is eligible if: has a valid email, no linked auth user, no pending invitation.
async function inviteAllTeachers(tenantId, onReload) {
  const [profiles, memberships, invitations] = await Promise.all([
    db.from("staff_profiles").select("id, employee_number, first_name, last_name, email").eq("tenant_id", tenantId),
    db.from("tenant_memberships").select("user_id, role").eq("tenant_id", tenantId).eq("active", true),
    db.from("tenant_invitations").select("email, role, accepted_at, expires_at").eq("tenant_id", tenantId).is("accepted_at", null),
  ]);

  const linkedUserIds = new Set((memberships.data || []).map((m) => m.user_id));
  const pendingEmails = new Set();
  (invitations.data || []).forEach((inv) => {
    if (new Date(inv.expires_at) > new Date()) {
      pendingEmails.add(inv.email.toLowerCase());
    }
  });

  const eligible = (profiles.data || []).filter((s) => {
    if (linkedUserIds.has(s.user_id)) return false;
    const email = (s.email || "").toLowerCase();
    if (!email) return false;
    if (pendingEmails.has(email)) return false;
    return true;
  });

  const alreadyActive = (profiles.data || []).filter((s) => linkedUserIds.has(s.user_id)).length;
  const noEmail = (profiles.data || []).filter((s) => !linkedUserIds.has(s.user_id) && !s.email).length;
  const alreadyInvited = (profiles.data || []).filter((s) => !linkedUserIds.has(s.user_id) && s.email && pendingEmails.has(s.email.toLowerCase())).length;

  if (!eligible.length) {
    toast(`No eligible teachers found. Already active: ${alreadyActive}, No email: ${noEmail}, Already invited: ${alreadyInvited}`, "error");
    return;
  }

  confirmAction("Invite all eligible teachers?", `You are about to invite ${eligible.length} teacher(s).`, async () => {

  const overlay = document.createElement("div");
  overlay.className = "modal";
  overlay.innerHTML = `<div>
      <h2>Inviting teachers…</h2>
      <p id="invite-all-teacher-progress" class="muted">Starting invitation batch…</p>
      <div id="invite-all-teacher-results"></div>
      <div class="wizard-nav"><button type="button" id="close-modal" class="link">Close</button></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector("#close-modal").onclick = () => overlay.remove();

  const progress = overlay.querySelector("#invite-all-teacher-progress");
  const resultsEl = overlay.querySelector("#invite-all-teacher-results");
  let sent = 0, failed = 0;
  const failedList = [];

  for (let i = 0; i < eligible.length; i++) {
    const staff = eligible[i];
    progress.textContent = `Inviting ${i + 1} of ${eligible.length}: ${staff.first_name} ${staff.last_name} (${staff.email})`;
    const { data, error } = await db.functions.invoke("invite-user", {
      body: { tenant_id: tenantId, email: staff.email, role: "teacher" },
    });
    if (error || data?.error) {
      failed++;
      failedList.push(`${staff.first_name} ${staff.last_name} (${staff.email}): ${error?.message || data?.error || "unknown error"}`);
    } else {
      sent++;
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  progress.textContent = `Complete`;
  resultsEl.innerHTML = `
    <div class="cards">
      <article>Invitations sent<strong>${sent}</strong></article>
      <article>Skipped (already active/invited/no email)<strong>${alreadyActive + alreadyInvited + noEmail}</strong></article>
      <article>Failed<strong>${failed}</strong></article>
    </div>
    ${failedList.length ? `<details><summary>Failed invitations (${failedList.length})</summary><ul>${failedList.map((f) => `<li>${esc(f)}</li>`).join("")}</ul></details>` : ""}
  `;
  setTimeout(() => onReload && onReload(), 1000);
  });
}

// Invite modal — no raw token is ever shown to the inviter.
// The invitation is created server-side with a SHA-256 hashed token.
// Email delivery is handled by the configured email provider (see
// docs/MANUAL_ACTIONS_REQUIRED.md for setup).
function openInviteModal(tenantId, ds, onDone) {
  const roleOptions = STAFF_INVITE_ROLES.map(([v, l]) => `<option value="${v}">${l}</option>`).join("");
  const overlay = document.createElement("div");
  overlay.className = "modal";
  overlay.innerHTML = `<div>
      <h2>Invite ${ds.name || ""}?</h2>
      <p class="muted">Send an invitation to <strong>${esc(ds.email)}</strong>. The invitee will receive an email with instructions to set up their login.</p>
      <form id="invite-form" class="grid">
        <label>Role<select name="role">${roleOptions}</select></label>
        <div><button type="button" id="cancel">Cancel</button><button type="submit" class="primary" id="invite-btn">Send invitation</button></div>
      </form>
      <p id="invite-msg" role="status"></p>
      <div id="invite-result"></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector("#cancel").onclick = () => overlay.remove();
  overlay.querySelector("#invite-form").onsubmit = async (e) => {
    e.preventDefault();
    const role = e.target.role.value;
    const msg = overlay.querySelector("#invite-msg");
    const btn = overlay.querySelector("#invite-btn");
    const res = overlay.querySelector("#invite-result");
    msg.textContent = "Sending invitation…";
    btn.disabled = true;
    btn.textContent = "Sending…";
    const { data, error } = await db.functions.invoke("invite-user", {
      body: { tenant_id: tenantId, email: ds.email, role },
    });
    btn.disabled = false;
    btn.textContent = "Send invitation";
    if (error) {
      msg.textContent = safeError(error);
      return;
    }
    if (data?.error) {
      msg.textContent = `Invitation error: ${esc(data.error)}`;
      if (data.error === "invitation_exists") {
        res.innerHTML = `<p class="muted">A pending invitation already exists for this email.</p>`;
      }
      return;
    }
    msg.innerHTML = "";
    res.innerHTML = `<p><span class="badge active">Invitation sent</span> ${esc(data.message || "The invitation has been created and will be delivered to the invitee.")}</p>`;
    setTimeout(() => { overlay.remove(); onDone && onDone(); }, 1500);
  };
}

// ---------- Staff CSV Import (file upload with validation + preview) ----------

async function importStaffCsv(tenantId, listEl, onReload) {
  const overlay = document.createElement("div");
  overlay.className = "modal";
  overlay.innerHTML = `<div>
      <h2>Import staff via CSV</h2>
      <p class="muted">Required: <code>employee_number,first_name,last_name</code>. Optional: <code>middle_name,email,phone,department,job_title</code>.</p>
      <form id="staff-csv-form" class="grid">
        <div class="span-2">
          <label class="drop-area" id="staff-drop" style="border:2px dashed #dce3ec;border-radius:8px;padding:24px;text-align:center;cursor:pointer;">
            <input type="file" id="staff-file" accept=".csv,text/csv" style="display:none">
            <div>📎 Drag &amp; drop a CSV file, or click to browse</div>
            <div id="staff-file-name" class="muted small"></div>
          </label>
        </div>
        <div><button type="button" id="cancel">Cancel</button><button type="submit" class="primary" id="parse-btn" disabled>Parse CSV</button></div>
      </form>
      <p id="staff-csv-msg" role="status"></p>
      <div id="staff-csv-preview"></div>
    </div>`;
  document.body.appendChild(overlay);

  const fileInput = overlay.querySelector("#staff-file");
  const dropArea = overlay.querySelector("#staff-drop");
  const fileNameEl = overlay.querySelector("#staff-file-name");
  const parseBtn = overlay.querySelector("#parse-btn");
  const msgEl = overlay.querySelector("#staff-csv-msg");
  const previewEl = overlay.querySelector("#staff-csv-preview");
  let csvText = "";

  dropArea.onclick = () => fileInput.click();
  dropArea.ondragover = (e) => { e.preventDefault(); dropArea.style.borderColor = "#2f80ed"; };
  dropArea.ondragleave = (e) => { e.preventDefault(); dropArea.style.borderColor = "#dce3ec"; };
  dropArea.ondrop = (e) => {
    e.preventDefault();
    dropArea.style.borderColor = "#dce3ec";
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  };
  fileInput.onchange = () => { if (fileInput.files.length) handleFiles(fileInput.files); };

  function handleFiles(files) {
    const file = files[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv") && file.type !== "text/csv") {
      msgEl.textContent = "Please upload a .csv file.";
      return;
    }
    fileNameEl.textContent = file.name;
    const reader = new FileReader();
    reader.onload = (e) => { csvText = e.target.result; parseBtn.disabled = false; msgEl.textContent = ""; previewEl.innerHTML = ""; };
    reader.readAsText(file);
  }

  overlay.querySelector("#cancel").onclick = () => overlay.remove();

  overlay.querySelector("#staff-csv-form").onsubmit = async (e) => {
    e.preventDefault();
    if (!csvText) { msgEl.textContent = "Upload a CSV file first."; return; }
    parseBtn.disabled = true;
    msgEl.textContent = "Parsing and validating…";
    const rows = parseCSV(csvText);
    if (rows.length < 2) {
      msgEl.textContent = "CSV must have a header row and at least one data row.";
      return;
    }
    const headers = rows[0].map((h) => h.trim().toLowerCase());
    const required = ["employee_number", "first_name", "last_name"];
    const missing = required.filter((c) => !headers.includes(c));
    if (missing.length) {
      msgEl.textContent = `Missing required columns: ${missing.join(", ")}`;
      return;
    }
    const idx = {};
    headers.forEach((h, i) => (idx[h] = i));

    // Fetch existing staff for duplicate detection.
    const { data: existingStaff } = await db.from("staff_profiles").select("employee_number, email").eq("tenant_id", tenantId);
    const existingEmpNumbers = new Set((existingStaff || []).map((s) => s.employee_number));
    const existingEmails = new Set((existingStaff || []).map((s) => (s.email || "").toLowerCase()));

    const records = [];
    const errors = [];
    const seenEmpNumbers = new Set();

    rows.slice(1).forEach((row, i) => {
      const rowNum = i + 2;
      const empNo = (row[idx["employee_number"]] || "").trim();
      const firstName = (row[idx["first_name"]] || "").trim();
      const lastName = (row[idx["last_name"]] || "").trim();
      if (!empNo || !firstName || !lastName) {
        errors.push({ row: rowNum, field: "required", error: "Missing employee_number, first_name, or last_name" });
        return;
      }
      if (seenEmpNumbers.has(empNo)) {
        errors.push({ row: rowNum, field: "employee_number", error: `Duplicate employee number "${empNo}" within CSV` });
        return;
      }
      seenEmpNumbers.add(empNo);
      if (existingEmpNumbers.has(empNo)) {
        errors.push({ row: rowNum, field: "employee_number", error: `Employee number "${empNo}" already exists in tenant` });
        return;
      }
      const email = idx["email"] != null ? (row[idx["email"]] || "").trim() : "";
      if (email && !isValidEmail(email)) {
        errors.push({ row: rowNum, field: "email", error: `Invalid email "${email}"` });
        return;
      }
      if (email && existingEmails.has(email.toLowerCase())) {
        errors.push({ row: rowNum, field: "email", error: `Email "${email}" already exists in tenant` });
        return;
      }
      records.push({
        tenant_id: tenantId,
        employee_number: empNo,
        first_name: firstName,
        middle_name: idx["middle_name"] != null ? (row[idx["middle_name"]] || "").trim() || null : null,
        last_name: lastName,
        email: email || null,
        phone: idx["phone"] != null ? (row[idx["phone"]] || "").trim() || null : null,
        department: idx["department"] != null ? (row[idx["department"]] || "").trim() || null : null,
        job_title: idx["job_title"] != null ? (row[idx["job_title"]] || "").trim() || null : null,
      });
    });

    // Show preview with validation summary.
    previewEl.innerHTML = `
      <div class="wizard-nav" style="justify-content:space-between">
        <span class="muted small">Total rows: ${rows.length - 1} • Valid: ${records.length} • Invalid: ${errors.length}</span>
        <div><button type="button" id="cancel-prev" class="link">Cancel</button><button type="button" id="import-btn" class="primary" disabled>Import ${records.length} staff</button></div>
      </div>
      ${errors.length ? `<table class="data" style="max-height:200px;overflow:auto">
        <thead><tr><th>Row</th><th>Field</th><th>Error</th></tr></thead>
        <tbody>${errors.map((e) => `<tr><td>${e.row}</td><td>${esc(e.field)}</td><td>${esc(e.error)}</td></tr>`).join("")}</tbody>
      </table>` : ""}
    `;
    overlay.querySelector("#cancel-prev").onclick = () => overlay.remove();
    const importBtn = overlay.querySelector("#import-btn");
    if (records.length) importBtn.disabled = false;

    importBtn.onclick = async () => {
      importBtn.disabled = true;
      importBtn.textContent = `Importing…`;
      msgEl.textContent = `Importing ${records.length} staff member(s)…`;
      // Import each staff member via create-account Edge Function to generate login_id, create Auth user, create membership
      const results = [];
      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        const { data, error } = await db.functions.invoke("create-account", {
          body: {
            tenant_id: tenantId,
            email: record.email,
            role: "teacher",
          },
        });
        if (error || !data?.login_id) {
          results.push({ ...record, error: error?.message || "Failed to create account" });
          continue;
        }
        // Insert staff profile with generated login_id
        const loginId = data.login_id;
        const { error: staffError } = await db.from("staff_profiles").insert({
          tenant_id: tenantId,
          employee_number: record.employee_number,
          first_name: record.first_name,
          middle_name: record.middle_name || null,
          last_name: record.last_name,
          email: record.email || null,
          department: record.department || null,
          job_title: record.job_title || null,
          login_id: loginId,
        });
        if (staffError) {
          results.push({ ...record, error: staffError.message || "Failed to insert staff profile" });
          continue;
        }
        results.push({ ...record, login_id: loginId, success: true });
      }
      // Count successes and failures
      const successful = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;
      msgEl.textContent = `Import complete: ${successful} successful, ${failed} failed.`;
      previewEl.innerHTML = errors.length ? `<table class="data" style="max-height:200px;overflow:auto">
        <thead><tr><th>Row</th><th>Field</th><th>Error</th></tr></thead>
        <tbody>${errors.map((e) => `<tr><td>${e.row}</td><td>${esc(e.field)}</td><td>${esc(e.error)}</td></tr>`).join("")}</tbody>
      </table>` : ``;
      // Show per-record results
      const resultRows = results.map((r, idx) => {
        if (r.success) {
          return `<tr><td>${idx + 2}</td><td>${r.employee_number}</td><td>${r.login_id}</td><td class="badge active">linked</td></tr>`;
        }
        return `<tr><td>${idx + 2}</td><td>${r.employee_number}</td><td colspan="2" class="error">Failed: ${r.error}</td></tr>`;
      });
      previewEl.innerHTML += errors.length || successful === 0
        ? `<p class="muted small">Import results: ${successful} succeeded, ${failed} failed.</p>`
        : `<p class="muted small">All rows processed. ${successful} account(s) created with login IDs.</p>`;
      setTimeout(() => { overlay.remove(); onReload && onReload(); }, 1200);
    };
    msgEl.textContent = "";
  };
}

// ---------- Students CSV Import (file upload with validation + preview) ----------

async function importStudentsCsv(tenantId, listEl, onReload) {
  const overlay = document.createElement("div");
  overlay.className = "modal";
  overlay.innerHTML = `<div>
      <h2>Import students via CSV</h2>
      <p class="muted">Required: <code>admission_number,first_name,last_name</code>. Optional: <code>middle_name,date_of_birth,gender,email,phone,guardian_name,guardian_phone</code>.</p>
      <form id="student-csv-form" class="grid">
        <div class="span-2">
          <label class="drop-area" id="student-drop" style="border:2px dashed #dce3ec;border-radius:8px;padding:24px;text-align:center;cursor:pointer;">
            <input type="file" id="student-file" accept=".csv,text/csv" style="display:none">
            <div>📎 Drag &amp; drop a CSV file, or click to browse</div>
            <div id="student-file-name" class="muted small"></div>
          </label>
        </div>
        <div><button type="button" id="cancel">Cancel</button><button type="submit" class="primary" id="parse-btn" disabled>Parse CSV</button></div>
      </form>
      <p id="student-csv-msg" role="status"></p>
      <div id="student-csv-preview"></div>
    </div>`;
  document.body.appendChild(overlay);

  const fileInput = overlay.querySelector("#student-file");
  const dropArea = overlay.querySelector("#student-drop");
  const fileNameEl = overlay.querySelector("#student-file-name");
  const parseBtn = overlay.querySelector("#parse-btn");
  const msgEl = overlay.querySelector("#student-csv-msg");
  const previewEl = overlay.querySelector("#student-csv-preview");
  let csvText = "";

  dropArea.onclick = () => fileInput.click();
  dropArea.ondragover = (e) => { e.preventDefault(); dropArea.style.borderColor = "#2f80ed"; };
  dropArea.ondragleave = (e) => { e.preventDefault(); dropArea.style.borderColor = "#dce3ec"; };
  dropArea.ondrop = (e) => {
    e.preventDefault();
    dropArea.style.borderColor = "#dce3ec";
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  };
  fileInput.onchange = () => { if (fileInput.files.length) handleFiles(fileInput.files); };

  function handleFiles(files) {
    const file = files[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv") && file.type !== "text/csv") {
      msgEl.textContent = "Please upload a .csv file.";
      return;
    }
    fileNameEl.textContent = file.name;
    const reader = new FileReader();
    reader.onload = (e) => { csvText = e.target.result; parseBtn.disabled = false; msgEl.textContent = ""; previewEl.innerHTML = ""; };
    reader.readAsText(file);
  }

  overlay.querySelector("#cancel").onclick = () => overlay.remove();

  overlay.querySelector("#student-csv-form").onsubmit = async (e) => {
    e.preventDefault();
    if (!csvText) { msgEl.textContent = "Upload a CSV file first."; return; }
    parseBtn.disabled = true;
    msgEl.textContent = "Parsing and validating…";
    const rows = parseCSV(csvText);
    if (rows.length < 2) {
      msgEl.textContent = "CSV must have a header row and at least one data row.";
      return;
    }
    const headers = rows[0].map((h) => h.trim().toLowerCase());
    const required = ["admission_number", "first_name", "last_name"];
    const missing = required.filter((c) => !headers.includes(c));
    if (missing.length) {
      msgEl.textContent = `Missing required columns: ${missing.join(", ")}`;
      return;
    }
    const idx = {};
    headers.forEach((h, i) => (idx[h] = i));

    // Fetch existing students for duplicate detection.
    const { data: existingStudents } = await db.from("students").select("admission_number, email").eq("tenant_id", tenantId);
    const existingAdmissionNumbers = new Set((existingStudents || []).map((s) => s.admission_number));
    const existingEmails = new Set((existingStudents || []).map((s) => (s.email || "").toLowerCase()));

    const records = [];
    const errors = [];
    const seenAdmissionNumbers = new Set();

    rows.slice(1).forEach((row, i) => {
      const rowNum = i + 2;
      const admission = (row[idx["admission_number"]] || "").trim();
      const firstName = (row[idx["first_name"]] || "").trim();
      const lastName = (row[idx["last_name"]] || "").trim();
      if (!admission || !firstName || !lastName) {
        errors.push({ row: rowNum, field: "required", error: "Missing admission_number, first_name, or last_name" });
        return;
      }
      if (seenAdmissionNumbers.has(admission)) {
        errors.push({ row: rowNum, field: "admission_number", error: `Duplicate admission number "${admission}" within CSV` });
        return;
      }
      seenAdmissionNumbers.add(admission);
      if (existingAdmissionNumbers.has(admission)) {
        errors.push({ row: rowNum, field: "admission_number", error: `Admission number "${admission}" already exists in tenant` });
        return;
      }
      const email = idx["email"] != null ? (row[idx["email"]] || "").trim() : "";
      if (email && !isValidEmail(email)) {
        errors.push({ row: rowNum, field: "email", error: `Invalid email "${email}"` });
        return;
      }
      if (email && existingEmails.has(email.toLowerCase())) {
        errors.push({ row: rowNum, field: "email", error: `Email "${email}" already exists in tenant` });
        return;
      }
      const dob = idx["date_of_birth"] != null ? (row[idx["date_of_birth"]] || "").trim() : "";
      if (dob && isNaN(Date.parse(dob))) {
        errors.push({ row: rowNum, field: "date_of_birth", error: `Invalid date "${dob}"` });
        return;
      }
      const gender = idx["gender"] != null ? (row[idx["gender"]] || "").trim() : "";
      if (gender && !["male", "female", "other", ""].includes(gender)) {
        errors.push({ row: rowNum, field: "gender", error: `Invalid gender "${gender}" (must be male, female, or other)` });
        return;
      }
      const guardianName = idx["guardian_name"] != null ? (row[idx["guardian_name"]] || "").trim() : "";
      const guardianPhone = idx["guardian_phone"] != null ? (row[idx["guardian_phone"]] || "").trim() : "";
      records.push({
        tenant_id: tenantId,
        admission_number: admission,
        first_name: firstName,
        middle_name: idx["middle_name"] != null ? (row[idx["middle_name"]] || "").trim() || null : null,
        last_name: lastName,
        email: email || null,
        phone: idx["phone"] != null ? (row[idx["phone"]] || "").trim() || null : null,
        date_of_birth: dob || null,
        gender: gender || null,
        guardian_details: (guardianName || guardianPhone) ? { guardian_name: guardianName, guardian_phone: guardianPhone } : {},
        status: idx["status"] != null ? ((row[idx["status"]] || "").trim() || "active") : "active",
      });
    });

    // Show preview with validation summary.
    previewEl.innerHTML = `
      <div class="wizard-nav" style="justify-content:space-between">
        <span class="muted small">Total rows: ${rows.length - 1} • Valid: ${records.length} • Invalid: ${errors.length}</span>
        <div><button type="button" id="cancel-prev" class="link">Cancel</button><button type="button" id="import-btn" class="primary" disabled>Import ${records.length} students</button></div>
      </div>
      ${errors.length ? `<table class="data" style="max-height:200px;overflow:auto">
        <thead><tr><th>Row</th><th>Field</th><th>Error</th></tr></thead>
        <tbody>${errors.map((e) => `<tr><td>${e.row}</td><td>${esc(e.field)}</td><td>${esc(e.error)}</td></tr>`).join("")}</tbody>
      </table>` : ""}
    `;
    overlay.querySelector("#cancel-prev").onclick = () => overlay.remove();
    const importBtn = overlay.querySelector("#import-btn");
    if (records.length) importBtn.disabled = false;

    importBtn.onclick = async () => {
      importBtn.disabled = true;
      importBtn.textContent = `Importing…`;
      msgEl.textContent = `Importing ${records.length} student(s)…`;
      // Import each student via create-account Edge Function to generate login_id, create Auth user, create membership
      const results = [];
      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        const { data, error } = await db.functions.invoke("create-account", {
          body: {
            tenant_id: tenantId,
            email: record.email,
            role: "student",
          },
        });
        if (error || !data?.login_id) {
          results.push({ ...record, error: error?.message || "Failed to create account" });
          continue;
        }
        // Insert student record with generated login_id
        const { error: studentError } = await db.from("students").insert({
          tenant_id: tenantId,
          admission_number: record.admission_number,
          first_name: record.first_name,
          middle_name: record.middle_name || null,
          last_name: record.last_name,
          email: record.email,
          date_of_birth: record.date_of_birth || null,
          gender: record.gender || null,
          status: record.status || "active",
          login_id: data.login_id,
        });
        if (studentError) {
          results.push({ ...record, error: studentError.message || "Failed to insert student" });
          continue;
        }
        results.push({ ...record, login_id: data.login_id, success: true });
      }
      // Count successes and failures
      const successful = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;
      msgEl.textContent = `Import complete: ${successful} successful, ${failed} failed.`;
      previewEl.innerHTML = errors.length ? `<table class="data" style="max-height:200px;overflow:auto">
        <thead><tr><th>Row</th><th>Field</th><th>Error</th></tr></thead>
        <tbody>${errors.map((e) => `<tr><td>${e.row}</td><td>${esc(e.field)}</td><td>${esc(e.error)}</td></tr>`).join("")}</tbody>
      </table>` : ``;
      // Show per-record results
      const resultRows = results.map((r, idx) => {
        if (r.success) {
          return `<tr><td>${idx + 2}</td><td>${r.admission_number}</td><td>${r.login_id}</td><td class="badge active">linked</td></tr>`;
        }
        return `<tr><td>${idx + 2}</td><td>${r.admission_number}</td><td colspan="2" class="error">Failed: ${r.error}</td></tr>`;
      });
      previewEl.innerHTML += errors.length || successful === 0
        ? `<p class="muted small">Import results: ${successful} succeeded, ${failed} failed.</p>`
        : `<p class="muted small">All rows processed. ${successful} account(s) created with login IDs.</p>`;
      setTimeout(() => { overlay.remove(); onReload && onReload(); }, 1200);
    };
    msgEl.textContent = "";
  };
}

// ---------- Announcements ----------

async function renderAnnouncements(body, tenantId) {
  body.innerHTML = `<div class="loading-center"><span class="spinner lg"></span>Loading announcements…</div>`;
  const [{ data: tenants }] = await Promise.all([
    db.from("tenants").select("name").eq("id", tenantId).maybeSingle(),
  ]);
  const tenantName = tenants?.name || "School";

  body.innerHTML = `<div class="panel">
      <h2>Announcements</h2>
      <form id="ann-form" class="grid">
        <label>Title<input name="title" required></label>
        <label>Audience<select name="audience"><option value="all">Everyone</option><option value="staff">Staff</option><option value="students">Students</option><option value="parents">Parents</option></select></label>
        <label>Publish date<input name="published_at" type="datetime-local"></label>
        <label>Expiry date<input name="expires_at" type="datetime-local"></label>
        <label class="span-2">Message<textarea name="body" rows="3" required></textarea></label>
        <div class="span-2" style="display:flex;gap:8px;align-items:center">
          <button type="submit" class="primary">Publish announcement</button>
          <label style="font-weight:normal;display:flex;gap:6px;align-items:center;font-size:13px">
            <input type="checkbox" name="notify_parents" value="true"> Email parents immediately
          </label>
        </div>
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
      ? `<table class="data"><thead><tr><th>Title</th><th>Audience</th><th>Published</th><th>Expires</th><th></th></tr></thead><tbody>${data
          .map((a) => `<tr><td>${esc(a.title)}</td><td><span class="badge">${esc(a.audience)}</span></td><td>${fmtDate(a.published_at)}</td><td>${fmtDate(a.expires_at)}</td><td><button class="link send-notif" data-id="${a.id}" data-title="${esc(a.title)}" data-body="${esc(a.body || "")}">Send to parents</button></td></tr>`)
          .join("")}</tbody></table>`
      : `<p class="muted">No announcements yet.</p>`;
    list.querySelectorAll(".send-notif").forEach((btn) => {
      btn.onclick = () => sendAnnouncementEmails(tenantId, tenantName, btn.dataset.id, btn.dataset.title, btn.dataset.body);
    });
  }

  body.querySelector("#ann-form").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const msg = body.querySelector("#ann-msg");
    const btn = e.target.querySelector("button[type=submit]");
    btn.disabled = true;
    msg.innerHTML = `<span class="spinner sm"></span> Publishing…`;
    const { data: userData } = await db.auth.getUser();
    const { data: ann, error } = await db.from("announcements").insert({
      tenant_id: tenantId,
      title: fd.get("title").trim(),
      body: fd.get("body").trim(),
      audience: fd.get("audience"),
      published_at: fd.get("published_at") ? new Date(fd.get("published_at")).toISOString() : new Date().toISOString(),
      expires_at: fd.get("expires_at") ? new Date(fd.get("expires_at")).toISOString() : null,
      created_by: userData?.user?.id || null,
    }).select("id").single();
    btn.disabled = false;
    if (error) {
      msg.textContent = safeError(error);
      return;
    }
    msg.textContent = "Announcement published.";
    e.target.reset();

    if (fd.get("notify_parents") && ann) {
      msg.innerHTML = `<span class="spinner sm"></span> Sending emails to parents…`;
      await sendAnnouncementEmails(tenantId, tenantName, ann.id, fd.get("title"), fd.get("body"));
      msg.textContent = "Announcement published and emails sent.";
    }
    load();
  };
  load();
}

async function sendAnnouncementEmails(tenantId, tenantName, annId, title, body) {
  const { data: parentProfiles } = await db
    .from("parent_profiles")
    .select("user_id")
    .eq("tenant_id", tenantId);
  const userIds = [...new Set((parentProfiles || []).map((p) => p.user_id).filter(Boolean))];
  if (!userIds.length) {
    toast("No parent accounts found to notify.", "error");
    return;
  }
  try {
    const { data, error } = await db.functions.invoke("send-announcement-email", {
      body: { tenant_id: tenantId, title, body, audience: "parents" },
    });
    if (error) {
      toast("Failed to send notifications: " + (error.message || "unknown error"), "error");
      return;
    }
    toast(`Notification sent to ${data?.sent || 0} parent(s).`);
  } catch (err) {
    toast("Failed to send notifications.", "error");
  }
}

// ---------- Report Cards ----------

async function renderReportCards(body, tenantId) {
  body.innerHTML = `<div class="loading-center"><span class="spinner lg"></span>Loading report cards…</div>`;
  const [years, scales, terms, classes, subjects, { data: students }] = await Promise.all([
    db.from("academic_years").select("id, name").eq("tenant_id", tenantId).order("name", { ascending: false }),
    db.from("grading_scales").select("id, name, is_default").eq("tenant_id", tenantId),
    db.from("terms").select("id, name, academic_year_id").eq("tenant_id", tenantId).order("starts_on"),
    db.from("classes").select("id, name").eq("tenant_id", tenantId).order("name"),
    db.from("subjects").select("id, name, code").eq("tenant_id", tenantId).order("name"),
    db.from("students").select("id, first_name, last_name, admission_number").eq("tenant_id", tenantId).eq("status", "active").order("last_name"),
  ]);
  const yearList = years || [];
  const scaleList = scales || [];
  const termList = terms || [];
  const classList = classes || [];
  const subjectList = subjects || [];
  const scaleById = Object.fromEntries(scaleList.map((s) => [s.id, s]));
  const classById = Object.fromEntries(classList.map((c) => [c.id, c]));
  const subjectById = Object.fromEntries(subjectList.map((s) => [s.id, s]));

  body.innerHTML = `
    <div class="tabs subtabs">
      <a href="#" class="tab active" data-sub="list">Report Cards</a>
      <a href="#" class="tab" data-sub="scales">Grading Scales</a>
    </div>
    <div id="rc-list"></div>
    <div id="rc-scales" class="hidden"></div>`;

  body.querySelectorAll("[data-sub]").forEach((a) => {
    a.onclick = (e) => {
      e.preventDefault();
      body.querySelectorAll("[data-sub]").forEach((t) => t.classList.remove("active"));
      a.classList.add("active");
      body.querySelector("#rc-list").classList.toggle("hidden", a.dataset.sub !== "list");
      body.querySelector("#rc-scales").classList.toggle("hidden", a.dataset.sub !== "scales");
    };
  });

  renderRCList(body.querySelector("#rc-list"), tenantId, yearList, scaleList, termList, classList, subjectList, scaleById, classById, subjectById);
  renderScales(body.querySelector("#rc-scales"), tenantId, scaleList);
}

function renderRCList(container, tenantId, years, scales, terms, classes, subjects, scaleById, classById, subjectById) {
  const classOptions = classes.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("");
  const yearOptions = years.map((y) => `<option value="${y.id}">${esc(y.name)}</option>`).join("");
  const termOptions = terms.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join("");
  container.innerHTML = `
    <div class="panel" style="margin-top:16px">
      <div class="panel-head"><h2>Generate Report Cards</h2></div>
      <form id="rc-gen-form" class="grid">
        <label>Academic Year<select id="rc-year" required>${yearOptions}</select></label>
        <label>Term (optional)<select id="rc-term"><option value="">All terms</option>${termOptions}</select></label>
        <label>Class (optional)<select id="rc-class"><option value="">All classes</option>${classOptions}</select></label>
        <label>Grading Scale<select id="rc-scale">${scales.map((s) => `<option value="${s.id}" ${s.is_default ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select></label>
        <div><button type="submit" class="primary">Generate Report Cards</button></div>
      </form>
      <p id="rc-msg" role="status"></p>
    </div>
    <div class="panel" style="margin-top:16px">
      <div class="panel-head"><h2>Existing Report Cards</h2>
        <div class="actions">
          <select id="rc-filter-year"><option value="">All years</option>${yearOptions}</select>
          <select id="rc-filter-class"><option value="">All classes</option>${classOptions}</select>
          <button id="print-all-btn" class="secondary">Print All</button>
        </div>
      </div>
      <div id="rc-list-table"><p class="muted">Click generate to create report cards.</p></div>
    </div>`;

  container.querySelector("#rc-gen-form").onsubmit = async (e) => {
    e.preventDefault();
    const msg = container.querySelector("#rc-msg");
    const btn = e.target.querySelector("button[type=submit]");
    const yearId = container.querySelector("#rc-year").value;
    const termId = container.querySelector("#rc-term").value || null;
    const classId = container.querySelector("#rc-class").value || null;
    const scaleId = container.querySelector("#rc-scale").value;
    btn.disabled = true;
    msg.innerHTML = `<span class="spinner sm"></span> Generating report cards…`;

    let enrolled = [];
    if (classId) {
      const { data } = await db.from("student_enrolments").select("student_id, class_id").eq("academic_year_id", yearId).eq("class_id", classId);
      enrolled = data || [];
    } else {
      const { data } = await db.from("student_enrolments").select("student_id, class_id").eq("academic_year_id", yearId);
      enrolled = data || [];
    }
    if (!enrolled.length) { msg.textContent = "No students enrolled for this selection."; btn.disabled = false; return; }

    let assessments = [];
    if (termId) {
      const { data } = await db.from("assessments").select("id, class_id, subject_id, maximum_mark, weighting").eq("academic_year_id", yearId).eq("tenant_id", tenantId).eq("term_id", termId).eq("status", "published");
      assessments = data || [];
    } else {
      const { data } = await db.from("assessments").select("id, class_id, subject_id, maximum_mark, weighting").eq("academic_year_id", yearId).eq("tenant_id", tenantId).eq("status", "published");
      assessments = data || [];
    }
    const assessmentIds = assessments.map((a) => a.id);
    const { data: results } = assessmentIds.length
      ? await db.from("assessment_results").select("assessment_id, student_id, mark").in("assessment_id", assessmentIds)
      : { data: [] };

    let created = 0;
    let updated = 0;
    for (const enrol of enrolled) {
      const existing = await db.from("report_cards").select("id").eq("student_id", enrol.student_id).eq("academic_year_id", yearId).eq("term_id", termId).maybeSingle();

      const studentResults = (results || []).filter((r) => r.student_id === enrol.student_id);
      const totalPct = studentResults.length
        ? studentResults.reduce((sum, r) => {
            const a = assessments.find((x) => x.id === r.assessment_id);
            return sum + (a ? (r.mark / a.maximum_mark) * 100 : 0);
          }, 0) / studentResults.length
        : 0;

      const grade = computeGrade(scaleById[scaleId], totalPct);

      if (existing.data) {
        await db.from("report_cards").update({ overall_average: Math.round(totalPct * 10) / 10, grade, scale_id: scaleId }).eq("id", existing.data.id);
        await db.from("report_card_lines").delete().eq("report_card_id", existing.data.id);
        for (const r of studentResults) {
          const a = assessments.find((x) => x.id === r.assessment_id);
          if (a) await db.from("report_card_lines").insert({ report_card_id: existing.data.id, subject_id: a.subject_id, total_mark: r.mark, max_mark: a.maximum_mark, average: Math.round((r.mark / a.maximum_mark) * 1000) / 10 });
        }
        updated++;
      } else {
        const { data: rc } = await db.from("report_cards").insert({
          tenant_id: tenantId, student_id: enrol.student_id, class_id: enrol.class_id, academic_year_id: yearId, term_id: termId,
          scale_id: scaleId || null, overall_average: Math.round(totalPct * 10) / 10, grade, status: "draft",
        }).select("id").single();
        if (rc) {
          for (const r of studentResults) {
            const a = assessments.find((x) => x.id === r.assessment_id);
            if (a) await db.from("report_card_lines").insert({ report_card_id: rc.id, subject_id: a.subject_id, total_mark: r.mark, max_mark: a.maximum_mark, average: Math.round((r.mark / a.maximum_mark) * 1000) / 10 });
          }
          created++;
        }
      }
    }
    msg.textContent = `Done: ${created} created, ${updated} updated.`;
    btn.disabled = false;
    loadRCList(container, tenantId, years, classes, scaleById, classById, subjectById);
  };

  container.querySelector("#rc-filter-year").onchange = () => loadRCList(container, tenantId, years, classes, scaleById, classById, subjectById);
  container.querySelector("#rc-filter-class").onchange = () => loadRCList(container, tenantId, years, classes, scaleById, classById, subjectById);
  container.querySelector("#print-all-btn").onclick = () => printAllReportCards(container);

  loadRCList(container, tenantId, years, classes, scaleById, classById, subjectById);
}

async function loadRCList(container, tenantId, years, classes, scaleById, classById, subjectById) {
  const tableEl = container.querySelector("#rc-list-table");
  const filterYear = container.querySelector("#rc-filter-year").value;
  const filterClass = container.querySelector("#rc-filter-class").value;
  tableEl.innerHTML = `<div class="loading-center"><span class="spinner"></span>Loading…</div>`;

  let query = db.from("report_cards").select("id, student_id, class_id, academic_year_id, overall_average, grade, status, created_at, students(first_name, last_name, admission_number)").eq("tenant_id", tenantId).order("created_at", { ascending: false });
  if (filterYear) query = query.eq("academic_year_id", filterYear);
  if (filterClass) query = query.eq("class_id", filterClass);
  const { data, error } = await query.limit(100);
  if (error) { tableEl.innerHTML = `<p class="error">${esc(safeError(error))}</p>`; return; }
  const rcList = data || [];
  if (!rcList.length) { tableEl.innerHTML = `<p class="muted">No report cards found.</p>`; return; }

  tableEl.innerHTML = `<table class="data"><thead><tr><th>Student</th><th>Class</th><th>Average</th><th>Grade</th><th>Status</th><th></th></tr></thead><tbody>${rcList.map((rc) => `<tr>
    <td>${esc(rc.students?.first_name || "")} ${esc(rc.students?.last_name || "")} (${esc(rc.students?.admission_number || "")})</td>
    <td>${esc(classById[rc.class_id]?.name || "—")}</td>
    <td>${rc.overall_average != null ? esc(rc.overall_average) + "%" : "—"}</td>
    <td><span class="badge">${esc(rc.grade || "—")}</span></td>
    <td><span class="badge ${rc.status === "published" ? "active" : "trial"}">${esc(rc.status)}</span></td>
    <td><button class="link view-rc" data-id="${rc.id}">View</button> <button class="link publish-rc" data-id="${rc.id}" ${rc.status === "published" ? "disabled" : ""}>Publish</button></td>
  </tr>`).join("")}</tbody></table>`;

  tableEl.querySelectorAll(".view-rc").forEach((btn) => {
    btn.onclick = () => viewReportCard(btn.dataset.id, tenantId, scaleById, classById, subjectById);
  });
  tableEl.querySelectorAll(".publish-rc").forEach((btn) => {
    btn.onclick = async () => {
      await db.from("report_cards").update({ status: "published" }).eq("id", btn.dataset.id);
      toast("Report card published");
      loadRCList(container, tenantId, years, classes, scaleById, classById, subjectById);
    };
  });
}

function computeGrade(scale, pct) {
  if (!scale) return null;
  // For now, use a simple A-F scale if no grading_scale_levels exist
  if (pct >= 90) return "A";
  if (pct >= 80) return "B";
  if (pct >= 70) return "C";
  if (pct >= 60) return "D";
  return "F";
}

async function viewReportCard(rcId, tenantId, scaleById, classById, subjectById) {
  const [{ data: rc }, { data: yearsData }, { data: tenantData }] = await Promise.all([
    db.from("report_cards").select("*, students(first_name, last_name, admission_number, date_of_birth, gender)").eq("id", rcId).single(),
    db.from("academic_years").select("id, name").eq("tenant_id", tenantId),
    db.from("tenants").select("name, motto, phone, email").eq("id", tenantId).maybeSingle(),
  ]);
  if (!rc) return;
  const { data: lines } = await db.from("report_card_lines").select("*, subjects(name, code)").eq("report_card_id", rcId);
  const { data: attendance } = await db.from("attendance_records").select("status").eq("student_id", rc.student_id).eq("tenant_id", tenantId);
  const attSummary = (attendance || []).reduce((acc, a) => ({ ...acc, [a.status]: (acc[a.status] || 0) + 1 }), {});
  const yearName = (yearsData || []).find((y) => y.id === rc.academic_year_id)?.name || "—";
  const schoolName = esc(tenantData?.name || "School");
  const schoolContact = [tenantData?.email, tenantData?.phone].filter(Boolean).join(" • ") || "School Address";

  const overlay = document.createElement("div");
  overlay.className = "modal";
  overlay.innerHTML = `<div style="max-width:700px">
    <div class="report-card-print" id="rc-print-area">
      <div style="text-align:center;border-bottom:2px solid var(--primary);padding-bottom:16px;margin-bottom:16px">
        <h2 style="margin:0;color:var(--primary)">${schoolName}</h2>
        <p class="muted">${esc(schoolContact)}</p>
        <h3 style="margin:8px 0 0">STUDENT REPORT CARD</h3>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
        <div><strong>Name:</strong> ${esc(rc.students?.first_name)} ${esc(rc.students?.last_name)}</div>
        <div><strong>Admission #:</strong> ${esc(rc.students?.admission_number)}</div>
        <div><strong>Class:</strong> ${esc(classById[rc.class_id]?.name || "—")}</div>
        <div><strong>Academic Year:</strong> ${esc(yearName)}</div>
      </div>
      <table class="data" style="margin-top:12px"><thead><tr><th>Subject</th><th>Mark</th><th>Max</th><th>Average %</th><th>Grade</th></tr></thead>
      <tbody>${(lines || []).map((l) => `<tr>
        <td>${esc(l.subjects?.name || "—")}</td>
        <td>${l.total_mark != null ? esc(l.total_mark) : "—"}</td>
        <td>${l.max_mark != null ? esc(l.max_mark) : "—"}</td>
        <td>${l.average != null ? esc(l.average) + "%" : "—"}</td>
        <td>${esc(computeGrade(null, l.average || 0))}</td>
      </tr>`).join("") || '<tr><td colspan="5" class="muted">No subject data.</td></tr>'}</tbody></table>
      <div style="margin-top:16px;padding-top:12px;border-top:1px solid #e0e7f0">
        <strong>Overall Average:</strong> ${rc.overall_average != null ? esc(rc.overall_average) + "%" : "—"} | <strong>Grade:</strong> ${esc(rc.grade || "—")}
      </div>
      <div style="margin-top:16px">
        <strong>Attendance Summary</strong>
        <p>${Object.entries(attSummary).map(([k, v]) => `<span class="badge">${k}: ${v}</span>`).join(" ") || "No records"}</p>
      </div>
    </div>
    <div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end">
      <button class="secondary" id="print-rc-btn">Print Report Card</button>
      <button class="link" id="close-rc">Close</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector("#close-rc").onclick = () => overlay.remove();
  overlay.querySelector("#print-rc-btn").onclick = () => {
    const content = overlay.querySelector("#rc-print-area").innerHTML;
    const win = window.open("", "_blank");
    win.document.write(`<html><head><title>Report Card</title><style>
      body{font-family:Arial,sans-serif;padding:20px;color:#17243a}
      table{width:100%;border-collapse:collapse;margin-top:12px}
      th,td{border:1px solid #e0e7f0;padding:8px;text-align:left;font-size:13px}
      th{background:#f4f7fb;font-weight:600}
      .badge{display:inline-block;padding:2px 8px;border-radius:10px;background:#eaf2ff;font-size:11px}
    </style></head><body>${content}</body></html>`);
    win.document.close();
    win.print();
  };
}

function printAllReportCards(container) {
  const area = container.querySelector("#rc-list-table");
  if (!area.querySelector("table")) { toast("No report cards to print", "error"); return; }
  const content = area.innerHTML;
  const win = window.open("", "_blank");
  win.document.write(`<html><head><title>Report Cards</title><style>
    body{font-family:Arial,sans-serif;padding:20px;color:#17243a}
    table{width:100%;border-collapse:collapse;margin-top:12px}
    th,td{border:1px solid #e0e7f0;padding:8px;text-align:left;font-size:13px}
    th{background:#f4f7fb;font-weight:600}
    .badge{display:inline-block;padding:2px 8px;border-radius:10px;background:#eaf2ff;font-size:11px}
    button{display:none}
  </style></head><body><h1>Report Cards</h1>${content}</body></html>`);
  win.document.close();
  win.print();
}

function renderScales(container, tenantId, existing) {
  container.innerHTML = `
    <div class="panel" style="margin-top:16px">
      <div class="panel-head"><h2>Grading Scales</h2>
        <button id="add-scale-btn" class="primary">New Scale</button>
      </div>
      <table class="data"><thead><tr><th>Name</th><th>Default</th><th></th></tr></thead>
      <tbody>${existing.map((s) => `<tr><td>${esc(s.name)}</td><td>${s.is_default ? "Yes" : ""}</td><td><button class="link edit-scale" data-id="${s.id}">Edit</button></td></tr>`).join("") || '<tr><td colspan="3" class="muted">No grading scales yet.</td></tr>'}</tbody></table>
    </div>
    <div id="scale-form-area"></div>`;

  container.querySelector("#add-scale-btn").onclick = () => {
    const area = container.querySelector("#scale-form-area");
    area.innerHTML = `
      <div class="panel" style="margin-top:16px">
        <div class="panel-head"><h2>New Grading Scale</h2></div>
        <form id="scale-form" class="grid">
          <label>Name<input type="text" name="name" required placeholder="e.g. Standard A-F"></label>
          <div><button type="submit" class="primary">Save</button> <button type="button" class="link" id="cancel-scale">Cancel</button></div>
        </form>
        <p id="scale-msg" role="status"></p>
      </div>`;
    area.querySelector("#cancel-scale").onclick = () => { area.innerHTML = ""; };
    area.querySelector("#scale-form").onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const { error } = await db.from("grading_scales").insert({ tenant_id: tenantId, name: fd.get("name").trim(), is_default: !existing.length });
      area.querySelector("#scale-msg").textContent = error ? safeError(error) : "Scale created.";
      if (!error) setTimeout(() => renderReportCards(container.closest("#school-body"), tenantId), 500);
    };
  };
}

// ---------- Timetable ----------

async function renderTimetable(body, tenantId) {
  body.innerHTML = `<p class="muted">Loading timetable…</p>`;
  const [years, classes, subjects, periods, slots] = await Promise.all([
    db.from("academic_years").select("id, name").eq("tenant_id", tenantId).order("name", { ascending: false }),
    db.from("classes").select("id, name").eq("tenant_id", tenantId),
    db.from("subjects").select("id, name").eq("tenant_id", tenantId),
    db.from("timetable_periods").select("id, name, start_time, end_time, sort_order, is_break").eq("tenant_id", tenantId).order("sort_order"),
    db.from("timetable_slots").select("id, class_id, subject_id, period_id, day_of_week, room, classes(name), subjects(name)").eq("tenant_id", tenantId),
  ]);

  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const periodList = periods || [];
  const slotList = slots || [];

  body.innerHTML = `
    <div class="panel" style="margin-top:16px">
      <div class="panel-head"><h2>Weekly Timetable</h2>
        <button id="add-period-btn" class="link">+ Period</button>
        <button id="add-slot-btn" class="primary">+ Slot</button>
      </div>
      <div style="overflow-x:auto">
        <table class="data" id="timetable-grid">
          <thead><tr><th>Period</th>${DAYS.map((d) => `<th>${d}</th>`).join("")}</tr></thead>
          <tbody>
            ${periodList.map((p) => `<tr${p.is_break ? ' style="background:#f4f7fb"' : ""}>
              <td><strong>${esc(p.name)}</strong><br><small>${esc((p.start_time || "").slice(0, 5))} - ${esc((p.end_time || "").slice(0, 5))}</small></td>
              ${DAYS.map((_, di) => {
                const slot = slotList.find((s) => s.period_id === p.id && s.day_of_week === di);
                if (slot) return `<td style="background:#e8f0fe"><strong>${esc(slot.subjects?.name || "")}</strong><br><small>${esc(slot.classes?.name || "")}</small>${slot.room ? `<br><small>${esc(slot.room)}</small>` : ""}</td>`;
                return p.is_break ? `<td style="background:#f0f0f0"></td>` : `<td></td>`;
              }).join("")}
            </tr>`).join("") || '<tr><td colspan="8" class="muted">No periods configured. Click "+ Period" to start.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
    <div id="tt-form-area"></div>`;

  body.querySelector("#add-period-btn").onclick = () => {
    const area = body.querySelector("#tt-form-area");
    area.innerHTML = `
      <div class="panel" style="margin-top:16px">
        <div class="panel-head"><h2>Add Period</h2></div>
        <form id="period-form" class="grid">
          <label>Name<input type="text" name="name" required placeholder="e.g. Period 1"></label>
          <label>Start time<input type="time" name="start_time" required></label>
          <label>End time<input type="time" name="end_time" required></label>
          <label><input type="checkbox" name="is_break"> Break period</label>
          <div><button type="submit" class="primary">Save</button> <button type="button" class="link" id="cancel-period">Cancel</button></div>
        </form>
        <p id="period-msg" role="status"></p>
      </div>`;
    area.querySelector("#cancel-period").onclick = () => { area.innerHTML = ""; };
    area.querySelector("#period-form").onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const maxOrder = periodList.length ? Math.max(...periodList.map((p) => p.sort_order || 0)) : 0;
      const { error } = await db.from("timetable_periods").insert({
        tenant_id: tenantId, name: fd.get("name").trim(),
        start_time: fd.get("start_time"), end_time: fd.get("end_time"),
        is_break: fd.has("is_break"), sort_order: maxOrder + 1,
      });
      area.querySelector("#period-msg").textContent = error ? safeError(error) : "Period added.";
      if (!error) setTimeout(() => renderTimetable(body, tenantId), 500);
    };
  };

  body.querySelector("#add-slot-btn").onclick = () => {
    const area = body.querySelector("#tt-form-area");
    area.innerHTML = `
      <div class="panel" style="margin-top:16px">
        <div class="panel-head"><h2>Add Timetable Slot</h2></div>
        <form id="slot-form" class="grid">
          <label>Year<select id="tt-year" required>${(years || []).map((y) => `<option value="${y.id}">${esc(y.name)}</option>`).join("")}</select></label>
          <label>Class<select id="tt-class" required>${(classes || []).map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select></label>
          <label>Subject<select id="tt-subject" required>${(subjects || []).map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join("")}</select></label>
          <label>Day<select id="tt-day" required>${DAYS.map((d, i) => `<option value="${i}">${d}</option>`).join("")}</select></label>
          <label>Period<select id="tt-period" required>${periodList.filter((p) => !p.is_break).map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select></label>
          <label>Room<input type="text" name="room" placeholder="Optional"></label>
          <div><button type="submit" class="primary">Save</button> <button type="button" class="link" id="cancel-slot">Cancel</button></div>
        </form>
        <p id="slot-msg" role="status"></p>
      </div>`;
    area.querySelector("#cancel-slot").onclick = () => { area.innerHTML = ""; };
    area.querySelector("#slot-form").onsubmit = async (e) => {
      e.preventDefault();
      const { data: userData } = await db.auth.getUser();
      const { error } = await db.from("timetable_slots").insert({
        tenant_id: tenantId,
        academic_year_id: body.querySelector("#tt-year").value,
        class_id: body.querySelector("#tt-class").value,
        subject_id: body.querySelector("#tt-subject").value,
        teacher_user_id: userData.user.id,
        period_id: body.querySelector("#tt-period").value,
        day_of_week: parseInt(body.querySelector("#tt-day").value),
        room: e.target.querySelector('[name="room"]').value.trim() || null,
      });
      area.querySelector("#slot-msg").textContent = error ? safeError(error) : "Slot added.";
      if (!error) setTimeout(() => renderTimetable(body, tenantId), 500);
    };
  };
}

// ---------- Finance ----------

async function renderFinance(body, tenantId) {
  body.innerHTML = `<div class="loading-center"><span class="spinner lg"></span>Loading finance…</div>`;
  const [catResult, structResult, invResult, payResult, { data: students }, { data: classes }] = await Promise.all([
    db.from("fee_categories").select("id, name, description").eq("tenant_id", tenantId).order("sort_order"),
    db.from("fee_structures").select("id, category_id, amount, currency, grade_or_form, fee_categories(name)").eq("tenant_id", tenantId),
    db.from("fee_invoices").select("id, student_id, amount, status, due_date, description, created_at, students(first_name, last_name, admission_number)").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(100),
    db.from("payments").select("id, invoice_id, amount, payment_method, payment_date, reference_number, notes").eq("tenant_id", tenantId).order("payment_date", { ascending: false }).limit(50),
    db.from("students").select("id, first_name, last_name, admission_number").eq("tenant_id", tenantId).eq("status", "active").order("last_name"),
    db.from("classes").select("id, name").eq("tenant_id", tenantId).order("name"),
  ]);

  const catList = catResult.data || [];
  const structList = structResult.data || [];
  const invoiceList = invResult.data || [];
  const paymentList = payResult.data || [];
  const studentList = students || [];
  const classList = classes || [];
  const totalInvoiced = invoiceList.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const totalPaid = paymentList.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const totalOutstanding = totalInvoiced - totalPaid;

  body.innerHTML = `
    <div class="tabs subtabs">
      <a href="#" class="tab active" data-sub="overview">Overview</a>
      <a href="#" class="tab" data-sub="invoices">Invoices</a>
      <a href="#" class="tab" data-sub="payments">Payments</a>
      <a href="#" class="tab" data-sub="categories">Categories</a>
    </div>
    <div id="fin-overview"></div>
    <div id="fin-invoices" class="hidden"></div>
    <div id="fin-payments" class="hidden"></div>
    <div id="fin-categories" class="hidden"></div>`;

  body.querySelectorAll("[data-sub]").forEach((a) => {
    a.onclick = (e) => {
      e.preventDefault();
      body.querySelectorAll("[data-sub]").forEach((t) => t.classList.remove("active"));
      a.classList.add("active");
      ["overview", "invoices", "payments", "categories"].forEach((s) => {
        body.querySelector(`#fin-${s}`).classList.toggle("hidden", a.dataset.sub !== s);
      });
    };
  });

  renderFinOverview(body.querySelector("#fin-overview"), totalInvoiced, totalPaid, totalOutstanding, invoiceList, paymentList);
  renderFinInvoices(body.querySelector("#fin-invoices"), tenantId, invoiceList, studentList, catList, structList);
  renderFinPayments(body.querySelector("#fin-payments"), tenantId, paymentList, invoiceList, studentList);
  renderFinCategories(body.querySelector("#fin-categories"), tenantId, catList, structList, classList);
}

function renderFinOverview(container, totalInvoiced, totalPaid, totalOutstanding, invoices, payments) {
  container.innerHTML = `
    <div class="cards" style="margin-top:16px">
      <article>Total Invoiced<strong>$${totalInvoiced.toLocaleString()}</strong></article>
      <article>Total Paid<strong style="color:#14713b">$${totalPaid.toLocaleString()}</strong></article>
      <article>Outstanding<strong style="color:#b3261e">$${totalOutstanding.toLocaleString()}</strong></article>
      <article>Invoices<strong>${invoices.length}</strong></article>
    </div>
    <div class="panel" style="margin-top:16px">
      <h2>Recent Invoices</h2>
      ${invoices.length ? `<table class="data"><thead><tr><th>Student</th><th>Amount</th><th>Status</th><th>Due</th></tr></thead><tbody>${invoices.slice(0, 10).map((i) => `<tr>
        <td>${esc(i.students?.first_name || "")} ${esc(i.students?.last_name || "")}</td>
        <td>$${Number(i.amount).toLocaleString()}</td>
        <td><span class="badge ${i.status === "paid" ? "active" : i.status === "overdue" ? "suspended" : "trial"}">${esc(i.status)}</span></td>
        <td>${fmtDate(i.due_date)}</td>
      </tr>`).join("")}</tbody></table>` : `<p class="muted">No invoices yet.</p>`}
    </div>`;
}

function renderFinInvoices(container, tenantId, invoices, students, categories, structures) {
  const studentOptions = students.map((s) => `<option value="${s.id}">${esc(s.first_name)} ${esc(s.last_name)} (${esc(s.admission_number)})</option>`).join("");
  const catOptions = categories.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("");
  container.innerHTML = `
    <div class="panel" style="margin-top:16px">
      <div class="panel-head"><h2>Invoices</h2>
        <div class="actions">
          <button id="new-invoice-btn" class="primary">New Invoice</button>
          <button id="bulk-invoice-btn" class="secondary">Bulk Invoice by Category</button>
        </div>
      </div>
      <div id="invoice-form-area"></div>
      <div id="invoice-table">
        ${invoices.length ? `<table class="data"><thead><tr><th>Student</th><th>Amount</th><th>Status</th><th>Due</th><th>Description</th><th></th></tr></thead><tbody>${invoices.map((i) => `<tr>
          <td>${esc(i.students?.first_name || "")} ${esc(i.students?.last_name || "")} (${esc(i.students?.admission_number || "")})</td>
          <td>$${Number(i.amount).toLocaleString()}</td>
          <td><span class="badge ${i.status === "paid" ? "active" : i.status === "overdue" ? "suspended" : "trial"}">${esc(i.status)}</span></td>
          <td>${fmtDate(i.due_date)}</td>
          <td>${esc(i.description || "—")}</td>
          <td>${i.status !== "paid" ? `<button class="link mark-paid" data-id="${i.id}" data-amount="${i.amount}">Mark Paid</button>` : ""}</td>
        </tr>`).join("")}</tbody></table>` : `<p class="muted">No invoices yet. Create one above.</p>`}
      </div>
    </div>`;

  container.querySelector("#new-invoice-btn").onclick = () => {
    const area = container.querySelector("#invoice-form-area");
    area.innerHTML = `
      <div class="panel" style="margin-top:16px;border:2px solid var(--secondary)">
        <div class="panel-head"><h2>New Invoice</h2><button class="link" id="cancel-inv">Cancel</button></div>
        <form id="inv-form" class="grid">
          <label>Student<select name="student_id" required><option value="">Select student…</option>${studentOptions}</select></label>
          <label>Amount ($)<input type="number" name="amount" min="0" step="0.01" required></label>
          <label>Due date<input type="date" name="due_date" required></label>
          <label>Description<input name="description" placeholder="e.g. Term 1 Tuition"></label>
          <div><button type="submit" class="primary">Create Invoice</button></div>
        </form>
        <p id="inv-msg" role="status"></p>
      </div>`;
    area.querySelector("#cancel-inv").onclick = () => { area.innerHTML = ""; };
    area.querySelector("#inv-form").onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const msg = area.querySelector("#inv-msg");
      const { error } = await db.from("fee_invoices").insert({
        tenant_id: tenantId, student_id: fd.get("student_id"), amount: Number(fd.get("amount")),
        due_date: fd.get("due_date"), description: fd.get("description") || null, status: "pending",
      });
      msg.textContent = error ? safeError(error) : "Invoice created.";
      if (!error) { area.innerHTML = ""; setTimeout(() => renderFinance(container.closest("#school-body"), tenantId), 500); }
    };
  };

  container.querySelector("#bulk-invoice-btn").onclick = () => {
    const area = container.querySelector("#invoice-form-area");
    area.innerHTML = `
      <div class="panel" style="margin-top:16px;border:2px solid var(--secondary)">
        <div class="panel-head"><h2>Bulk Invoice by Category</h2><button class="link" id="cancel-bulk">Cancel</button></div>
        <form id="bulk-form" class="grid">
          <label>Fee Category<select name="category_id" required><option value="">Select…</option>${catOptions}</select></label>
          <label>Due date<input type="date" name="due_date" required></label>
          <div><button type="submit" class="primary">Invoice All Students</button></div>
        </form>
        <p id="bulk-msg" role="status"></p>
      </div>`;
    area.querySelector("#cancel-bulk").onclick = () => { area.innerHTML = ""; };
    area.querySelector("#bulk-form").onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const msg = area.querySelector("#bulk-msg");
      const catId = fd.get("category_id");
      const dueDate = fd.get("due_date");
      const structure = structures.find((s) => s.category_id === catId);
      if (!structure) { msg.textContent = "No fee structure found for this category. Create one in Categories first."; return; }
      msg.innerHTML = `<span class="spinner sm"></span> Creating invoices…`;
      let created = 0;
      for (const s of students) {
        const { data: existing } = await db.from("fee_invoices").select("id").eq("tenant_id", tenantId).eq("student_id", s.id).eq("status", "pending").maybeSingle();
        if (existing) continue;
        const { error } = await db.from("fee_invoices").insert({
          tenant_id: tenantId, student_id: s.id, amount: structure.amount, due_date: dueDate,
          description: structure.fee_categories?.name || "Fee", status: "pending",
        });
        if (!error) created++;
      }
      msg.textContent = `Created ${created} invoice(s).`;
      setTimeout(() => renderFinance(container.closest("#school-body"), tenantId), 1000);
    };
  };

  container.querySelectorAll(".mark-paid").forEach((btn) => {
    btn.onclick = () => openPaymentModal(tenantId, btn.dataset.id, Number(btn.dataset.amount), () => renderFinance(container.closest("#school-body"), tenantId));
  });
}

function openPaymentModal(tenantId, invoiceId, invoiceAmount, onDone) {
  const overlay = document.createElement("div");
  overlay.className = "modal";
  overlay.innerHTML = `<div style="max-width:420px">
    <h2>Record Payment</h2>
    <form id="pay-form" class="grid">
      <label>Amount ($)<input type="number" name="amount" min="0" step="0.01" value="${invoiceAmount}" required></label>
      <label>Payment method<select name="payment_method"><option>cash</option><option>bank_transfer</option><option>mobile_money</option><option>card</option><option>other</option></select></label>
      <label>Payment date<input type="date" name="payment_date" value="${new Date().toISOString().slice(0, 10)}" required></label>
      <label>Reference #<input name="reference_number" placeholder="optional"></label>
      <label>Notes<textarea name="notes" rows="2" placeholder="optional"></textarea></label>
      <div><button type="submit" class="primary">Save Payment</button> <button type="button" class="link" id="cancel-pay">Cancel</button></div>
    </form>
    <p id="pay-msg" role="status"></p>
  </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector("#cancel-pay").onclick = () => overlay.remove();
  overlay.querySelector("#pay-form").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const msg = overlay.querySelector("#pay-msg");
    const { error: payErr } = await db.from("payments").insert({
      tenant_id: tenantId, invoice_id: invoiceId, amount: Number(fd.get("amount")),
      payment_method: fd.get("payment_method"), payment_date: fd.get("payment_date"),
      reference_number: fd.get("reference_number") || null, notes: fd.get("notes") || null,
    });
    if (payErr) { msg.textContent = safeError(payErr); return; }
    await db.from("fee_invoices").update({ status: "paid" }).eq("id", invoiceId);
    overlay.remove();
    toast("Payment recorded");
    onDone && onDone();
  };
}

function renderFinPayments(container, tenantId, payments, invoices, students) {
  container.innerHTML = `
    <div class="panel" style="margin-top:16px">
      <div class="panel-head"><h2>Payments</h2></div>
      ${payments.length ? `<table class="data"><thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Reference</th><th>Notes</th></tr></thead><tbody>${payments.map((p) => `<tr>
        <td>${fmtDate(p.payment_date)}</td>
        <td>$${Number(p.amount).toLocaleString()}</td>
        <td><span class="badge">${esc(p.payment_method)}</span></td>
        <td>${esc(p.reference_number || "—")}</td>
        <td>${esc(p.notes || "—")}</td>
      </tr>`).join("")}</tbody></table>` : `<p class="muted">No payments recorded yet.</p>`}
    </div>`;
}

function renderFinCategories(container, tenantId, categories, structures, classes) {
  container.innerHTML = `
    <div class="panel" style="margin-top:16px">
      <div class="panel-head"><h2>Fee Categories</h2>
        <button id="add-cat-btn" class="primary">New Category</button>
      </div>
      <table class="data"><thead><tr><th>Name</th><th>Description</th><th>Structures</th><th></th></tr></thead>
      <tbody>${categories.map((c) => {
        const structs = structures.filter((s) => s.category_id === c.id);
        return `<tr><td>${esc(c.name)}</td><td>${esc(c.description || "—")}</td><td>${structs.length}</td><td><button class="link add-struct" data-cat="${c.id}">+ Structure</button></td></tr>`;
      }).join("") || '<tr><td colspan="4" class="muted">No fee categories.</td></tr>'}</tbody></table>
    </div>
    <div id="cat-form-area"></div>`;

  container.querySelector("#add-cat-btn").onclick = () => {
    const area = container.querySelector("#cat-form-area");
    area.innerHTML = `
      <div class="panel" style="margin-top:16px">
        <div class="panel-head"><h2>New Fee Category</h2></div>
        <form id="cat-form" class="grid">
          <label>Name<input type="text" name="name" required placeholder="e.g. Tuition"></label>
          <label>Description<input type="text" name="description"></label>
          <div><button type="submit" class="primary">Save</button> <button type="button" class="link" id="cancel-cat">Cancel</button></div>
        </form>
        <p id="cat-msg" role="status"></p>
      </div>`;
    area.querySelector("#cancel-cat").onclick = () => { area.innerHTML = ""; };
    area.querySelector("#cat-form").onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const { error } = await db.from("fee_categories").insert({ tenant_id: tenantId, name: fd.get("name").trim(), description: fd.get("description").trim() || null });
      area.querySelector("#cat-msg").textContent = error ? safeError(error) : "Category created.";
      if (!error) setTimeout(() => renderFinance(container.closest("#school-body"), tenantId), 500);
    };
  };

  container.querySelectorAll(".add-struct").forEach((btn) => {
    btn.onclick = () => {
      const area = container.querySelector("#cat-form-area");
      const catId = btn.dataset.cat;
      const catName = categories.find((c) => c.id === catId)?.name || "";
      const classOpts = classes.map((c) => `<option value="${c.name}">${esc(c.name)}</option>`).join("");
      area.innerHTML = `
        <div class="panel" style="margin-top:16px">
          <div class="panel-head"><h2>New Fee Structure — ${esc(catName)}</h2></div>
          <form id="struct-form" class="grid">
            <label>Amount ($)<input type="number" name="amount" min="0" step="0.01" required></label>
            <label>Currency<input name="currency" value="USD"></label>
            <label>Grade / Form<select name="grade_or_form"><option value="">All</option>${classOpts}</select></label>
            <div><button type="submit" class="primary">Save</button> <button type="button" class="link" id="cancel-struct">Cancel</button></div>
          </form>
          <p id="struct-msg" role="status"></p>
        </div>`;
      area.querySelector("#cancel-struct").onclick = () => { area.innerHTML = ""; };
      area.querySelector("#struct-form").onsubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const { error } = await db.from("fee_structures").insert({
          tenant_id: tenantId, category_id: catId, amount: Number(fd.get("amount")),
          currency: fd.get("currency") || "USD", grade_or_form: fd.get("grade_or_form") || null,
        });
        area.querySelector("#struct-msg").textContent = error ? safeError(error) : "Structure created.";
        if (!error) setTimeout(() => renderFinance(container.closest("#school-body"), tenantId), 500);
      };
    };
  });
}
