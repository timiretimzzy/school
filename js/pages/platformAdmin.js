import { db } from "../supabaseClient.js";
import { esc, safeError, fmtDate, fmtDateTime } from "../util.js";

let wizard = null;

export async function renderPlatform(container, section) {
  section = section || "dashboard";
  container.innerHTML = platformNav(section) + `<div id="platform-body"></div>`;
  const body = container.querySelector("#platform-body");
  if (section === "dashboard") return renderDashboard(body);
  if (section === "schools") return renderSchools(body);
  if (section === "onboard") return renderOnboard(body);
  return renderDashboard(body);
}

function platformNav(active) {
  const items = [
    ["dashboard", "Dashboard"],
    ["schools", "Schools"],
    ["onboard", "Onboard a school"],
  ];
  return `<div class="tabs">${items
    .map(([v, label]) => `<a href="#/platform/${v}" class="tab ${active === v ? "active" : ""}">${label}</a>`)
    .join("")}</div>`;
}

async function renderDashboard(body) {
  body.innerHTML = `<p class="muted">Loading platform metrics…</p>`;
  const [tenants, students] = await Promise.all([
    db.from("tenants").select("id, name, status, created_at").order("created_at", { ascending: false }),
    db.from("students").select("id", { count: "exact", head: true }),
  ]);
  if (tenants.error) {
    body.innerHTML = `<p class="error">${esc(safeError(tenants.error))}</p>`;
    return;
  }
  const rows = tenants.data || [];
  const byStatus = (status) => rows.filter((r) => r.status === status).length;
  const recent = rows.slice(0, 5);
  body.innerHTML = `
    <div class="cards">
      <article>Total schools<strong>${rows.length}</strong></article>
      <article>Active schools<strong>${byStatus("active")}</strong></article>
      <article>Trial schools<strong>${byStatus("trial")}</strong></article>
      <article>Suspended schools<strong>${byStatus("suspended")}</strong></article>
      <article>Total students<strong>${students.count ?? 0}</strong></article>
    </div>
    <div class="panel">
      <h2>Recently onboarded schools</h2>
      ${
        recent.length
          ? `<table class="data"><thead><tr><th>School</th><th>Status</th><th>Onboarded</th></tr></thead><tbody>${recent
              .map((r) => `<tr><td>${esc(r.name)}</td><td><span class="badge ${r.status}">${esc(r.status)}</span></td><td>${fmtDate(r.created_at)}</td></tr>`)
              .join("")}</tbody></table>`
          : `<p class="muted">No schools yet. Use "Onboard a school" to create the first tenant.</p>`
      }
    </div>`;
}

async function renderSchools(body) {
  body.innerHTML = `
    <div class="panel">
      <div class="panel-head">
        <h2>Schools</h2>
        <input id="school-search" placeholder="Search by name or slug…">
      </div>
      <div id="school-list">Loading…</div>
    </div>
    <div id="school-detail"></div>`;
  const list = body.querySelector("#school-list");
  const search = body.querySelector("#school-search");
  async function load(term) {
    list.textContent = "Loading…";
    let query = db.from("tenants").select("id, name, slug, status, subscription_status, created_at").order("created_at", { ascending: false });
    if (term) query = query.or(`name.ilike.%${term}%,slug.ilike.%${term}%`);
    const { data, error } = await query;
    if (error) {
      list.innerHTML = `<p class="error">${esc(safeError(error))}</p>`;
      return;
    }
    list.innerHTML = data.length
      ? `<table class="data"><thead><tr><th>Name</th><th>Slug</th><th>Status</th><th>Subscription</th><th></th></tr></thead><tbody>${data
          .map(
            (t) =>
              `<tr><td>${esc(t.name)}</td><td>${esc(t.slug)}</td><td><span class="badge ${t.status}">${esc(t.status)}</span></td><td>${esc(t.subscription_status)}</td><td><button class="link" data-view="${t.id}">View</button></td></tr>`,
          )
          .join("")}</tbody></table>`
      : `<p class="muted">No schools match your search.</p>`;
    list.querySelectorAll("[data-view]").forEach((btn) => (btn.onclick = () => renderDetail(t(btn.dataset.view))));
    function t(id) {
      return data.find((x) => x.id === id);
    }
  }
  async function renderDetail(tenant) {
    const detail = body.querySelector("#school-detail");
    detail.innerHTML = `<p class="muted">Loading school details…</p>`;
    const [branding, modules, members] = await Promise.all([
      db.from("tenant_branding").select("*").eq("tenant_id", tenant.id).maybeSingle(),
      db.from("tenant_modules").select("module_key, enabled").eq("tenant_id", tenant.id),
      db.from("tenant_memberships").select("role, active").eq("tenant_id", tenant.id),
    ]);
    detail.innerHTML = `
      <div class="panel">
        <div class="panel-head">
          <h2>${esc(tenant.name)}</h2>
          <div class="actions">
            <button data-act="edit">Edit</button>
            <button data-act="suspend" ${tenant.status === "suspended" ? "disabled" : ""}>Suspend</button>
            <button data-act="activate" ${tenant.status === "active" ? "disabled" : ""}>Activate</button>
          </div>
        </div>
        <p class="muted">Slug: ${esc(tenant.slug)} • Created ${fmtDate(tenant.created_at)}</p>
        <label>Subscription status
          <select id="sub-status">
            ${["trial", "active", "past_due", "cancelled"].map((s) => `<option value="${s}" ${tenant.subscription_status === s ? "selected" : ""}>${s}</option>`).join("")}
          </select>
        </label>
        <h3>Branding</h3>
        <p class="muted">Primary ${esc(branding.data?.primary_color || "—")} · Secondary ${esc(branding.data?.secondary_color || "—")} · Accent ${esc(branding.data?.accent_color || "—")}</p>
        <h3>Modules</h3>
        <p>${(modules.data || []).filter((m) => m.enabled).map((m) => `<span class="badge">${esc(m.module_key)}</span>`).join(" ") || "<span class=\"muted\">None enabled</span>"}</p>
        <h3>Members (${(members.data || []).length})</h3>
        <p>${(members.data || []).map((m) => `<span class="badge">${esc(m.role)}${m.active ? "" : " (inactive)"}</span>`).join(" ") || "<span class=\"muted\">No members yet — invitation may be pending.</span>"}</p>
        <p id="detail-msg" role="status"></p>
      </div>`;
    detail.querySelector("[data-act=edit]").onclick = async () => {
      const name = prompt("School name", tenant.name);
      if (name === null) return;
      const { error } = await db.from("tenants").update({ name }).eq("id", tenant.id);
      detail.querySelector("#detail-msg").textContent = error ? safeError(error) : "Updated.";
      if (!error) {
        tenant.name = name;
        load(search.value.trim());
        renderDetail(tenant);
      }
    };
    detail.querySelector("[data-act=suspend]").onclick = async () => {
      const { error } = await db.from("tenants").update({ status: "suspended" }).eq("id", tenant.id);
      if (!error) tenant.status = "suspended";
      detail.querySelector("#detail-msg").textContent = error ? safeError(error) : "School suspended.";
      load(search.value.trim());
      renderDetail(tenant);
    };
    detail.querySelector("[data-act=activate]").onclick = async () => {
      const { error } = await db.from("tenants").update({ status: "active" }).eq("id", tenant.id);
      if (!error) tenant.status = "active";
      detail.querySelector("#detail-msg").textContent = error ? safeError(error) : "School activated.";
      load(search.value.trim());
      renderDetail(tenant);
    };
    detail.querySelector("#sub-status").onchange = async (e) => {
      const { error } = await db.from("tenants").update({ subscription_status: e.target.value }).eq("id", tenant.id);
      detail.querySelector("#detail-msg").textContent = error ? safeError(error) : "Subscription status updated.";
    };
  }
  let timer;
  search.oninput = () => {
    clearTimeout(timer);
    timer = setTimeout(() => load(search.value.trim()), 250);
  };
  load("");
}

const MVP_MODULES = [
  ["student_management", "Student Management"],
  ["academics", "Academics"],
  ["attendance", "Attendance"],
  ["assessments", "Assessments"],
  ["parent_portal", "Parent Portal"],
  ["announcements", "Announcements"],
];

function renderOnboard(body) {
  wizard = wizard || {
    step: 1,
    school: { name: "", display_name: "", slug: "", motto: "", email: "", phone: "" },
    branding: { logo_url: "", primary_color: "#123c69", secondary_color: "#2f80ed", accent_color: "#f2b705" },
    modules: ["student_management", "academics", "attendance", "assessments"],
    admin: { name: "", email: "" },
  };
  renderWizardStep(body);
}

function renderWizardStep(body) {
  const s = wizard.step;
  const steps = ["School information", "Branding", "Modules", "Initial administrator", "Review & create"];
  body.innerHTML = `
    <div class="panel wizard">
      <ol class="steps">${steps.map((label, i) => `<li class="${i + 1 === s ? "active" : i + 1 < s ? "done" : ""}">${i + 1}. ${label}</li>`).join("")}</ol>
      <div id="wizard-step"></div>
      <p id="wizard-msg" role="status"></p>
    </div>`;
  const stepEl = body.querySelector("#wizard-step");
  if (s === 1) return stepInfo(stepEl, body);
  if (s === 2) return stepBranding(stepEl, body);
  if (s === 3) return stepModules(stepEl, body);
  if (s === 4) return stepAdmin(stepEl, body);
  return stepReview(stepEl, body);
}

function nav(stepEl, body, { back, next, nextLabel = "Next" } = {}) {
  const row = document.createElement("div");
  row.className = "wizard-nav";
  if (back) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = "Back";
    b.onclick = () => {
      wizard.step -= 1;
      renderWizardStep(body);
    };
    row.appendChild(b);
  }
  const n = document.createElement("button");
  n.type = "button";
  n.className = "primary";
  n.textContent = nextLabel;
  n.onclick = next;
  row.appendChild(n);
  stepEl.appendChild(row);
}

function stepInfo(stepEl, body) {
  const w = wizard.school;
  stepEl.innerHTML = `<div class="grid">
    <label>School name<input id="f-name" value="${esc(w.name)}" placeholder="Greenwood High School"></label>
    <label>Display name<input id="f-display" value="${esc(w.display_name)}" placeholder="Greenwood High"></label>
    <label>Slug<input id="f-slug" value="${esc(w.slug)}" placeholder="greenwood-high"></label>
    <label>Motto<input id="f-motto" value="${esc(w.motto)}"></label>
    <label>Email<input id="f-email" type="email" value="${esc(w.email)}"></label>
    <label>Phone<input id="f-phone" value="${esc(w.phone)}"></label>
  </div>`;
  nav(stepEl, body, {
    next: () => {
      w.name = stepEl.querySelector("#f-name").value.trim();
      w.display_name = stepEl.querySelector("#f-display").value.trim();
      w.slug = stepEl.querySelector("#f-slug").value.trim().toLowerCase();
      w.motto = stepEl.querySelector("#f-motto").value.trim();
      w.email = stepEl.querySelector("#f-email").value.trim();
      w.phone = stepEl.querySelector("#f-phone").value.trim();
      const msg = body.querySelector("#wizard-msg");
      if (w.name.length < 2 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(w.slug)) {
        msg.textContent = "Enter a school name and a lowercase, hyphenated slug.";
        return;
      }
      msg.textContent = "";
      wizard.step = 2;
      renderWizardStep(body);
    },
  });
}

function stepBranding(stepEl, body) {
  const b = wizard.branding;
  stepEl.innerHTML = `<div class="grid">
    <label>Logo URL<input id="f-logo" value="${esc(b.logo_url)}" placeholder="https://…"></label>
    <label>Primary colour<input id="f-primary" type="color" value="${esc(b.primary_color)}"></label>
    <label>Secondary colour<input id="f-secondary" type="color" value="${esc(b.secondary_color)}"></label>
    <label>Accent colour<input id="f-accent" type="color" value="${esc(b.accent_color)}"></label>
  </div>`;
  nav(stepEl, body, {
    back: true,
    next: () => {
      b.logo_url = stepEl.querySelector("#f-logo").value.trim();
      b.primary_color = stepEl.querySelector("#f-primary").value;
      b.secondary_color = stepEl.querySelector("#f-secondary").value;
      b.accent_color = stepEl.querySelector("#f-accent").value;
      wizard.step = 3;
      renderWizardStep(body);
    },
  });
}

function stepModules(stepEl, body) {
  stepEl.innerHTML = `<div class="checks">${MVP_MODULES.map(
    ([key, label]) => `<label><input type="checkbox" value="${key}" ${wizard.modules.includes(key) ? "checked" : ""}> ${label}</label>`,
  ).join("")}</div>`;
  nav(stepEl, body, {
    back: true,
    next: () => {
      wizard.modules = [...stepEl.querySelectorAll("input:checked")].map((i) => i.value);
      wizard.step = 4;
      renderWizardStep(body);
    },
  });
}

function stepAdmin(stepEl, body) {
  const a = wizard.admin;
  stepEl.innerHTML = `<div class="grid">
    <label>Administrator name<input id="f-aname" value="${esc(a.name)}"></label>
    <label>Administrator email<input id="f-aemail" type="email" value="${esc(a.email)}"></label>
  </div>
  <p class="muted">An invitation will be created for this person with the <strong>school_admin</strong> role.</p>`;
  nav(stepEl, body, {
    back: true,
    next: () => {
      a.name = stepEl.querySelector("#f-aname").value.trim();
      a.email = stepEl.querySelector("#f-aemail").value.trim();
      wizard.step = 5;
      renderWizardStep(body);
    },
  });
}

function stepReview(stepEl, body) {
  const { school, branding, modules, admin } = wizard;
  stepEl.innerHTML = `
    <h3>${esc(school.name)}</h3>
    <p class="muted">${esc(school.slug)} • ${esc(school.email || "no email")} • ${esc(school.phone || "no phone")}</p>
    <p>${esc(school.motto || "")}</p>
    <p>Branding: <span class="badge" style="background:${esc(branding.primary_color)};color:#fff">${esc(branding.primary_color)}</span> <span class="badge" style="background:${esc(branding.secondary_color)};color:#fff">${esc(branding.secondary_color)}</span> <span class="badge" style="background:${esc(branding.accent_color)};color:#fff">${esc(branding.accent_color)}</span></p>
    <p>Modules: ${modules.map((m) => `<span class="badge">${esc(m)}</span>`).join(" ") || "None"}</p>
    <p>Initial administrator: ${esc(admin.name || "—")} (${esc(admin.email || "—")})</p>`;
  nav(stepEl, body, {
    back: true,
    nextLabel: "Create school",
    next: async () => {
      const msg = body.querySelector("#wizard-msg");
      msg.textContent = "Creating school…";
      const { data, error } = await db.functions.invoke("create-tenant", {
        body: {
          name: school.name,
          slug: school.slug,
          motto: school.motto || null,
          branding: { display_name: school.display_name || school.name, ...branding },
          modules,
          admin_email: admin.email || null,
        },
      });
      if (error) {
        msg.textContent = safeError(error);
        return;
      }
      const token = data?.invitation?.token;
      msg.innerHTML = `School <strong>${esc(data.tenant.name)}</strong> created.${
        token
          ? ` Share this one-time invitation token with ${esc(admin.email)}: <code>${esc(token)}</code>`
          : ""
      }`;
      wizard = null;
    },
  });
}
