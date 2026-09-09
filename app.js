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
import { renderPasswordChange } from "./js/components/PasswordChange.js";

let identity = null;
let contexts = [];
let activeContext = null;
let isInitialized = false;

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
    if (session && !identity && isInitialized) onSignedIn(session);
    if (!session && isInitialized) showLogin();
  });
  isInitialized = true;
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
  const loginId = el("login-id").value.trim();
  const password = el("login-password").value.trim();
  await db.auth.signOut();

  if (loginId.includes("@")) {
    const { data: signIn, error: signInError } = await db.auth.signInWithPassword({ email: loginId, password });
    if (signInError) {
      msg.textContent = "Sign-in failed. Check your email and password.";
      return;
    }
    if (signIn && signIn.session) {
      await onSignedIn(signIn.session);
      return;
    }
  }

  if (loginId) {
    try {
      const response = await fetch(
        `${window.EDUSTACK_CONFIG.SUPABASE_URL}/functions/v1/login-with-login-id`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${window.EDUSTACK_CONFIG.SUPABASE_PUBLISHABLE_KEY || window.EDUSTACK_CONFIG.SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ login_id: loginId, password }),
        }
      );
      const data = await response.json();
      if (data?.error || !data?.success || !data?.session) {
        msg.textContent = data?.error || "Sign-in failed. Check your login ID and password.";
        return;
      }
      await db.auth.setSession(data.session);
      await onSignedIn(data.session);
      return;
    } catch (err) {
      msg.textContent = "Network error. Check your connection.";
      return;
    }
  }

  msg.textContent = "Please enter a login ID or email.";
}

async function onSignOut() {
  await db.auth.signOut();
  identity = null;
  contexts = [];
  activeContext = null;
  showLogin();
}

async function onSignedIn(session) {
  el("login-msg").textContent = "Loading workspace…";
  identity = await resolveIdentity(session.user);
  contexts = buildContexts(identity);

  const mustChangePassword = identity?.memberships?.some((m) => m.must_change_password === true);
  if (mustChangePassword) {
    showPasswordChangeFlow(session.user.id, session.user.email, contexts);
    return;
  }

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
  const platformIndex = contexts.findIndex((c) => c.kind === "platform");
  const schoolIndex = contexts.findIndex((c) => c.kind === "school" || c.kind === "teacher" || c.kind === "parent" || c.kind === "student");
  await setContext(platformIndex >= 0 ? platformIndex : (schoolIndex >= 0 ? schoolIndex : 0));
}

function showPasswordChangeFlow(userId, userEmail, contextsArray) {
  el("login-screen").classList.add("hidden");
  el("shell").classList.add("hidden");
  const overlay = document.createElement("div");
  overlay.className = "modal";
  document.body.appendChild(overlay);
  renderPasswordChange(overlay, async () => {
    document.body.removeChild(overlay);
    try {
      const { data: userData } = await db.auth.getUser();
      identity = await resolveIdentity(userData.user);
      contexts = buildContexts(identity);
    } catch (err) {
      identity = null;
      contexts = [];
    }
    if (!contexts.length) {
      showLogin();
      return;
    }
    el("login-screen").classList.add("hidden");
    el("shell").classList.remove("hidden");
    el("session-badge").textContent = `● ${userEmail}`;
    const switcher = el("context-switch");
    switcher.innerHTML = contexts.map((c, i) => `<option value="${i}">${esc(c.label)}</option>`).join("");
    switcher.onchange = () => setContext(Number(switcher.value));
    const platformIndex = contexts.findIndex((c) => c.kind === "platform");
    const schoolIndex = contexts.findIndex((c) => c.kind === "school" || c.kind === "teacher" || c.kind === "parent" || c.kind === "student");
    await setContext(platformIndex >= 0 ? platformIndex : (schoolIndex >= 0 ? schoolIndex : 0));
  }, { userId, tenantId: contextsArray[0]?.tenantId });
}

async function setContext(index) {
  activeContext = contexts[index];
  el("context-switch").value = String(index);
  if (activeContext.tenantId) {
    try {
      const branding = await loadTenantBranding(activeContext.tenantId);
      applyBranding(branding, activeContext.label);
    } catch (err) {
      applyBranding(null, activeContext.label);
    }
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
  const hash = window.location.hash.replace(/^#\//, "");
  const scope = hash.split("/")[0] || "";
  const section = hash.split("/")[1] || "dashboard";
  const isAcceptInvite = hash === "accept-invite";
  const isPasswordChange = hash === "change-password";

  if (!isAcceptInvite && !isPasswordChange) {
    const mustChangePassword = identity?.memberships?.some((m) => m.must_change_password === true);
    if (mustChangePassword) {
      showPasswordChangeFlow(identity.user.id, identity.user.email, contexts);
      return;
    }
  }

  if (scope === "accept-invite") {
    el("page-title").textContent = "Accept invitation";
    renderAcceptInvite(el("app"), async () => {
      identity = null;
      const { data } = await db.auth.getSession();
      if (data.session) await onSignedIn(data.session);
    });
    return;
  }

  el("page-title").textContent = (section || "dashboard").replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());
  document.querySelectorAll("#sidebar-nav .nav").forEach((a) => a.classList.toggle("active", a.getAttribute("href") === `#/${hash}`));

  try {
    const container = el("app");
    if (activeContext.kind === "platform") return renderPlatform(container, section);
    if (activeContext.kind === "school") return renderSchoolAdmin(container, activeContext.tenantId, section);
    if (activeContext.kind === "teacher") return renderTeacher(container, activeContext.tenantId, identity.user.id, section);
    if (activeContext.kind === "student") return renderStudent(container, activeContext.tenantId, identity.user.id);
    if (activeContext.kind === "parent") return renderParent(container, activeContext.tenantId, activeContext.parentId);
  } catch (err) {
    el("app").innerHTML = `<p class="error">${esc(safeError(err))}</p>`;
  }
}

init();
