import { db } from "./supabaseClient.js";

// Resolves "who is this authenticated user, and in what capacity" across the
// whole platform: FiscalStack platform admin, one or more school memberships,
// a parent profile, or none of the above (unauthorized).
export async function resolveIdentity(user) {
  if (!user) return null;
  const identity = { user, isPlatformAdmin: false, memberships: [], parentProfile: null };

  const [{ data: platformAdmin }, { data: memberships }, { data: parentProfile }] = await Promise.all([
    db.from("platform_admins").select("role").eq("user_id", user.id).maybeSingle(),
    db
      .from("tenant_memberships")
      .select("id, role, tenant_id, tenants(name, slug)")
      .eq("user_id", user.id)
      .eq("active", true),
    db.from("parent_profiles").select("id, tenant_id, first_name, last_name").eq("user_id", user.id).maybeSingle(),
  ]);

  identity.isPlatformAdmin = Boolean(platformAdmin);
  identity.memberships = memberships || [];
  identity.parentProfile = parentProfile || null;
  return identity;
}

// A user can, in principle, hold more than one role (e.g. teacher at one
// school and a parent at another). The active context picks a single
// "workspace" to render; the switcher lets the user change it.
export function buildContexts(identity) {
  const contexts = [];
  if (identity.isPlatformAdmin) contexts.push({ kind: "platform", label: "FiscalStack Platform Admin" });
  for (const m of identity.memberships) {
    contexts.push({
      kind: m.role === "teacher" ? "teacher" : m.role === "student" ? "student" : "school",
      label: `${m.tenants?.name || "School"} — ${m.role.replace("_", " ")}`,
      tenantId: m.tenant_id,
      role: m.role,
    });
  }
  if (identity.parentProfile) {
    contexts.push({
      kind: "parent",
      label: "Parent portal",
      tenantId: identity.parentProfile.tenant_id,
      parentId: identity.parentProfile.id,
    });
  }
  return contexts;
}
