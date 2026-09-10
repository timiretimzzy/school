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

// Global error boundary — catches unhandled errors and shows them in #app
window.addEventListener("error", (event) => {
  console.error("Uncaught error:", event.error);
  const appEl = document.getElementById("app");
  if (appEl) appEl.innerHTML = `<p class="error">Something went wrong. Please refresh the page.</p>`;
});
window.addEventListener("unhandledrejection", (event) => {
  console.error("Unhandled promise rejection:", event.reason);
  const appEl = document.getElementById("app");
  if (appEl) appEl.innerHTML = `<p class="error">Something went wrong. Please refresh the page.</p>`;
});

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
    ["report-cards", "Report cards"],
    ["timetable", "Timetable"],
    ["finance", "Finance"],
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
  el("hamburger").onclick = toggleMobileNav;
  el("sidebar-overlay").onclick = closeMobileNav;
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

function toggleMobileNav() {
  el("sidebar").classList.toggle("open");
  el("sidebar-overlay").classList.toggle("open");
  el("hamburger").classList.toggle("open");
}

function closeMobileNav() {
  el("sidebar").classList.remove("open");
  el("sidebar-overlay").classList.remove("open");
  el("hamburger").classList.remove("open");
}

function showLogin() {
  el("login-screen").classList.remove("hidden");
  el("shell").classList.add("hidden");
  resetBranding();
}

async function onLogin(e) {
  e.preventDefault();
  const msg = el("login-msg");
  const btn = el("login-form").querySelector("button[type=submit]");
  btn.disabled = true;
  msg.innerHTML = `<span class="spinner sm"></span> Signing in…`;
  const loginId = el("login-id").value.trim();
  const password = el("login-password").value;
  await db.auth.signOut();

  function loginError(text) { msg.textContent = text; btn.disabled = false; }

  if (loginId.includes("@")) {
    const { data: signIn, error: signInError } = await db.auth.signInWithPassword({ email: loginId, password });
    if (signInError) return loginError("Sign-in failed. Check your email and password.");
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
        return loginError(data?.error || "Sign-in failed. Check your login ID and password.");
      }
      await db.auth.setSession(data.session);
      await onSignedIn(data.session);
      return;
    } catch (err) {
      return loginError("Network error. Check your connection.");
    }
  }

  loginError("Please enter a login ID or email.");
}

async function onSignOut() {
  await db.auth.signOut();
  identity = null;
  contexts = [];
  activeContext = null;
  showLogin();
}

async function onSignedIn(session) {
  el("login-msg").innerHTML = `<span class="spinner sm"></span> Loading workspace…`;
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
  loadNotifications(session.user.id);
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
  document.querySelectorAll("#sidebar-nav .nav").forEach((a) => {
    a.addEventListener("click", closeMobileNav);
  });
}

/* ─── Toast ─── */
window.toast = function(message, type = "success", duration = 3000) {
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();
  const t = document.createElement("div");
  t.className = `toast ${type === "error" ? "error" : ""}`;
  t.textContent = message;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), duration);
};

/* ─── Confirm Dialog ─── */
window.confirmAction = function(title, message, onConfirm) {
  const overlay = document.createElement("div");
  overlay.className = "modal confirm-modal";
  overlay.innerHTML = `<div>
    <h3 style="margin:0">${esc(title)}</h3>
    <p>${esc(message)}</p>
    <div class="actions">
      <button class="secondary" id="confirm-cancel">Cancel</button>
      <button class="danger" id="confirm-ok">Confirm</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector("#confirm-cancel").onclick = () => overlay.remove();
  overlay.querySelector("#confirm-ok").onclick = async () => {
    overlay.querySelector("#confirm-ok").disabled = true;
    overlay.querySelector("#confirm-ok").textContent = "Working…";
    try { await onConfirm(); } catch (err) { console.error(err); toast("An error occurred."); }
    overlay.remove();
  };
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
};

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

async function loadNotifications(userId) {
  try {
    const { data } = await db.from("notifications").select("id, title, body, type, link, read_at, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(20);
    const notifs = data || [];
    const unread = notifs.filter((n) => !n.read_at).length;
    const countEl = el("notif-count");
    if (unread > 0) { countEl.textContent = unread; countEl.style.display = "inline"; }
    else { countEl.style.display = "none"; }

    el("notif-bell").onclick = () => {
      const existing = document.querySelector(".notif-dropdown");
      if (existing) { existing.remove(); return; }
      const dd = document.createElement("div");
      dd.className = "notif-dropdown";
      dd.style.cssText = "position:fixed;top:50px;right:20px;width:320px;max-height:400px;overflow:auto;background:#fff;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,.15);z-index:100;padding:16px";
      dd.innerHTML = `<h3 style="margin:0 0 12px">Notifications</h3>` +
        (notifs.length ? notifs.map((n) => `
          <div style="padding:8px 0;border-bottom:1px solid #eee;${!n.read_at ? "font-weight:600" : ""}">
            <div style="font-size:13px">${esc(n.title)}</div>
            ${n.body ? `<div style="font-size:12px;color:#666;margin-top:2px">${esc(n.body)}</div>` : ""}
            <div style="font-size:11px;color:#999;margin-top:2px">${new Date(n.created_at).toLocaleString()}</div>
          </div>`).join("") : '<p class="muted">No notifications.</p>');
      document.body.appendChild(dd);
      document.addEventListener("click", function close(e) { if (!dd.contains(e.target) && e.target !== el("notif-bell")) { dd.remove(); document.removeEventListener("click", close); } });
    };
  } catch {}
}

init();
