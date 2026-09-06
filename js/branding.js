import { db } from "./supabaseClient.js";

const DEFAULTS = { primary: "#123c69", secondary: "#2f80ed", accent: "#f2b705" };

// Applies a tenant's branding to the running page by setting CSS custom
// properties, updating the document title, and swapping the sidebar logo.
// This is the one place that must run for white-label branding to be real
// rather than merely stored in the database.
export function applyBranding(branding, tenantName) {
  const root = document.documentElement.style;
  root.setProperty("--primary", branding?.primary_color || DEFAULTS.primary);
  root.setProperty("--secondary", branding?.secondary_color || DEFAULTS.secondary);
  root.setProperty("--accent", branding?.accent_color || DEFAULTS.accent);
  const label = branding?.display_name || tenantName;
  if (label) document.title = `${label} | EduStack`;
  const brandName = document.getElementById("brand-name");
  if (brandName) brandName.textContent = label || "EDUSTACK";
  const brandLogo = document.getElementById("brand-logo");
  if (brandLogo) {
    if (branding?.logo_url) {
      brandLogo.src = branding.logo_url;
      brandLogo.classList.remove("hidden");
    } else {
      brandLogo.classList.add("hidden");
    }
  }
}

export function resetBranding() {
  applyBranding(null, "EDUSTACK");
  document.title = "EduStack | FiscalStack Solutions";
}

export async function loadTenantBranding(tenantId) {
  if (!db) return null;
  const { data } = await db.from("tenant_branding").select("*").eq("tenant_id", tenantId).maybeSingle();
  return data;
}
