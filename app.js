import { db, isConfigured } from "./js/supabaseClient.js";
import { el, esc, safeError } from "./js/util.js";
import { resolveIdentity, buildContexts } from "./js/session.js";
import { applyBranding, resetBranding, loadTenantBranding } from "./js/branding.js";
import { renderPlatform } from "./js/pages/platformAdmin.js";
import { renderSchoolAdmin } from "./js/pages/schoolAdmin.js";
import { renderTeacher } from "./js/pages/teacher.js";
import { renderStudent } from "./js/pages/student.js";
import { renderParent } from "./js/pages/parent.js";
import { renderAcceptInvite } from "./js/pages/acceptInvite.js";

let identity = null;
let contexts = [];
let activeContext = null;

const NAV = {
  platform: [
    ["dashboard", "Dashboard"],
    ["schools", "Schools"],
    ["onboard", "Onboard a school"],
  ],
  school: [
    ["dashboard", "Dashboard"],
    ["academics", "Academic setup"],
    ["students", "Students"],
    ["staff", "Staff & teachers"],
    ["announcements", "Announcements"],
  ],
  teacher: [
    ["dashboard", "Dashboard"],
    ["attendance", "Attendance"],
    ["assessments", "Assessments & marks"],
  ],
  student: [],
  parent: [],
};

const SECTION_PREFIX = { platform: "platform", school: "school", teacher: "teacher", student: "student", parent: "parent" };

async function init() {
  if (!isConfigured) {
    el("config-status").textContent = "Supabase is not configured. See docs/ENVIRONMENT_SETUP.md.";
    return;
  }
  el("login-form").onsubmit = onLogin;
  el("signout").onclick = onSignOut;
  window.addEventListener("hashchange", route);

  const { data } = await db.auth.getSession();
  if (data.session) await onSignedIn(data.session);
  else showLogin();

  db.auth.onAuthStateChange((_event, session) => {
    if (session && !identity) onSignedIn(session);
    if (!session) showLogin();
  });
}

function showLogin() {
  el("login-screen").classList.remove("hidden");
  el("shell").classList.add("hidden");
  resetBranding();
}

async function onLogin(e) {
  e.preventDefault();
  const msg = el("login-msg");
  msg.textContent = "Signing in…";
  const { error } = await db.auth.signInWithPassword({ email: el("login-email").value, password: el("login-password").value });
  if (error) {
    msg.textContent = "Sign-in failed. Check your email and password.";
    return;
  }
  msg.textContent = "";
}

async function onSignOut() {
  await db.auth.signOut();
  identity = null;
  contexts = [];
  activeContext = null;
  showLogin();
}

async function onSignedIn(session) {
  identity = await resolveIdentity(session.user);
  contexts = buildContexts(identity);
  if (!contexts.length) {
    el("login-screen").classList.remove("hidden");
    el("shell").classList.add("hidden");
    el("login-msg").innerHTML = `Signed in as ${esc(session.user.email)}, but no school or platform role is linked to this account yet. If you have an invitation, <a href="#/accept-invite">accept it here</a>.`;
    return;
  }
  el("login-screen").classList.add("hidden");
  el("shell").classList.remove("hidden");
  el("session-badge").textContent = `● ${session.user.email}`;
  const switcher = el("context-switch");
  switcher.innerHTML = contexts.map((c, i) => `<option value="${i}">${esc(c.label)}</option>`).join("");
  switcher.onchange = () => setContext(Number(switcher.value));
  await setContext(0);
}

async function setContext(index) {
  activeContext = contexts[index];
  el("context-switch").value = String(index);
  if (activeContext.tenantId) {
    const branding = await loadTenantBranding(activeContext.tenantId);
    applyBranding(branding, activeContext.label);
  } else {
    resetBranding();
  }
  renderSidebar();
  const hash = window.location.hash.replace("#/", "");
  const prefix = SECTION_PREFIX[activeContext.kind];
  if (hash.startsWith(prefix + "/") || hash === "accept-invite") {
    route();
  } else {
    window.location.hash = `#/${prefix}`;
  }
}

function renderSidebar() {
  const items = NAV[activeContext.kind] || [];
  const prefix = SECTION_PREFIX[activeContext.kind];
  el("sidebar-nav").innerHTML = items
    .map(([v, label]) => `<a href="#/${prefix}/${v}" class="nav">${esc(label)}</a>`)
    .join("");
  el("context-label").textContent = activeContext.label.toUpperCase();
}

async function route() {
  if (!activeContext) return;
  const app = el("app");
  const hash = window.location.hash.replace(/^#\//, "");
  const [scope, section] = hash.split("/");

  if (scope === "accept-invite") {
    el("page-title").textContent = "Accept invitation";
    renderAcceptInvite(app, async () => {
      identity = null;
      const { data } = await db.auth.getSession();
      if (data.session) await onSignedIn(data.session);
    });
    return;
  }

  el("page-title").textContent = (section || "dashboard").replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());
  document.querySelectorAll("#sidebar-nav .nav").forEach((a) => a.classList.toggle("active", a.getAttribute("href") === `#/${hash}`));

  try {
    if (activeContext.kind === "platform") return renderPlatform(app, section);
    if (activeContext.kind === "school") return renderSchoolAdmin(app, activeContext.tenantId, section);
    if (activeContext.kind === "teacher") return renderTeacher(app, activeContext.tenantId, identity.user.id, section);
    if (activeContext.kind === "student") return renderStudent(app, activeContext.tenantId, identity.user.id);
    if (activeContext.kind === "parent") return renderParent(app, activeContext.tenantId, activeContext.parentId);
  } catch (err) {
    app.innerHTML = `<p class="error">${esc(safeError(err))}</p>`;
  }
}

init();
