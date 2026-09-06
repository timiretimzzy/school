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
  await db.auth.signOut();
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
  const loginId = el("login-id").value.trim();
  const password = el("login-password").value.trim();
  await db.auth.signOut();

  // Try login_id + password authentication first
  if (loginId) {
    const response = await fetch("/functions/v1/login-with-login-id", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login_id: loginId, password }),
    });
    const data = await response.json();

    if (data?.error || !data?.success || !data?.session) {
      // Fall back to email + password if login_id auth fails
      const email = el("login-email").value.trim().toLowerCase();
      if (email) {
        const { data: signIn, error: signInError } = await db.auth.signInWithPassword({ email, password });
        if (signInError) {
          msg.textContent = "Sign-in failed. Check your login ID or email and password.";
          return;
        }
        if (signIn && signIn.session) {
          await onSignedIn(signIn.session);
          return;
        }
      }
      msg.textContent = data?.error || "Sign-in failed. Check your login ID or email and password.";
      return;
    }

    // login_id auth succeeded - set the Supabase session from Edge Function response
    await db.auth.setSession(data.session);
    await onSignedIn(data.session);
    return;
  }

  // Fall back to email + password (backwards compatibility)
  const email = el("login-email").value.trim().toLowerCase();
  if (!email) {
    msg.textContent = "Please enter a login ID or email.";
    return;
  }
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) {
    msg.textContent = error.message || "Sign-in failed. Check your email and password.";
    return;
  }
  if (data && data.session) {
    await onSignedIn(data.session);
    return;
  }
  const session = await db.auth.getSession();
  if (session.data && session.data.session) {
    await onSignedIn(session.data.session);
    return;
  }
  msg.textContent = "Signed in, but no session was returned. Please refresh.";
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

  // Check must_change_password flag from memberships (Edge Function already checked, but double-check)
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
  // Render the password change component in the main app area
  el("login-screen").classList.add("hidden");
  el("shell").classList.add("hidden");
  
  const overlay = document.createElement("div");
  overlay.className = "modal";
  document.body.appendChild(overlay);
  
  renderPasswordChange(overlay, async () => {
    document.body.removeChild(overlay);
    // After password change, re-resolve identity and continue
    identity = await resolveIdentity((await db.auth.getUser()).data.user);
    contexts = buildContexts(identity);
    
    if (!contexts.length) {
      showLogin();
      return;
    }
    el("login-screen").classList.add("hidden");
    el("shell").classList.remove("hidden");
    const switcher = el("context-switch");
    switcher.innerHTML = contexts.map((c, i) => `<option value="${i}">${esc(c.label)}</option>`).join("");
    switcher.onchange = () => setContext(Number(switcher.value));
    const platformIndex = contexts.findIndex((c) => c.kind === "platform");
    const schoolIndex = contexts.findIndex((c) => c.kind === "school" || c.kind === "teacher" || c.kind === "parent" || c.kind === "student");
    await setContext(platformIndex >= 0 ? platformIndex : (schoolIndex >= 0 ? schoolIndex : 0));
    // Trigger route for the new context
    window.location.hash = "";
  }, { userId, tenantId: contextsArray[0]?.tenantId });
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
  
  // Route guard: Check if user must change password (except for accept-invite and password change flows)
  const hash = window.location.hash.replace(/^#\//, "");
  const isAcceptInvite = hash === "accept-invite";
  const isPasswordChange = hash === "change-password";
  
  if (!isAcceptInvite && !isPasswordChange) {
    const mustChangePassword = identity?.memberships?.some((m) => m.must_change_password === true);
    if (mustChangePassword) {
      // Force password change - user cannot access any other route
      showPasswordChangeFlow(identity.user.id, identity.user.email, contexts);
      return;
    }
  }

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
