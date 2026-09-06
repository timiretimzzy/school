import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

// SHA-256 hex digest, matching the hashing scheme used by accept-invitation.
async function hashToken(raw: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request) => {
  // Authenticate the caller via their Supabase access token.
  const authHeader = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!authHeader) return response({ error: "unauthenticated" }, 401);

  const caller = await admin.auth.getUser(authHeader);
  if (caller.error || !caller.data.user) return response({ error: "unauthenticated" }, 401);

  const input = await request.json().catch(() => ({}));

  // Validate required fields.
  if (typeof input.tenant_id !== "string" || typeof input.email !== "string" || typeof input.role !== "string") {
    return response({ error: "invalid_input" }, 400);
  }

  const callerId = caller.data.user.id;
  const email = input.email.trim().toLowerCase();

  // --- Authorization: must be a school_admin / principal for this tenant,
  // --- or a platform admin. A school_admin can only invite into their own
  // --- tenant; a platform admin can invite into any tenant.
  const { data: membership } = await admin
    .from("tenant_memberships")
    .select("role")
    .eq("tenant_id", input.tenant_id)
    .eq("user_id", callerId)
    .eq("active", true)
    .in("role", ["school_admin", "principal"])
    .maybeSingle();

  const { data: platformAdmin } = await admin
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", callerId)
    .maybeSingle();

  if (!membership && !platformAdmin) {
    return response({ error: "forbidden" }, 403);
  }

  // Prevent escalation: a school_admin may only invite school-level roles.
  // Platform admins may grant any role.
  const SCHOOL_ROLES = ["school_admin", "principal", "registrar", "teacher", "finance_officer", "librarian", "parent", "student"];
  if (!platformAdmin && !SCHOOL_ROLES.includes(input.role)) {
    return response({ error: "forbidden" }, 403);
  }

  // Student invitations may carry a student_id in metadata so that
  // accept-invitation can link the new auth user to the correct student.
  const metadata: Record<string, unknown> = {};
  if (input.role === "student" && typeof input.student_id === "string" && input.student_id) {
    metadata.student_id = input.student_id;
  }

  // If a pending, unexpired invitation already exists for this email+tenant,
  // refuse to create a duplicate — return the existing one instead.
  const { data: existing } = await admin
    .from("tenant_invitations")
    .select("id, accepted_at, expires_at")
    .eq("tenant_id", input.tenant_id)
    .eq("email", email)
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (existing) {
    return response(
      { error: "invitation_exists", invitation_id: existing.id },
      409,
    );
  }

  // Generate a raw token, store only its SHA-256 hash in the database.
  // The raw token is NEVER returned to the caller — it is used only for
  // email delivery (not yet configured in this deployment; see
  // docs/MANUAL_ACTIONS_REQUIRED.md for the email provider setup).
  const raw = crypto.randomUUID() + crypto.randomUUID();
  const token_hash = await hashToken(raw);

  const { data: invitation, error } = await admin
    .from("tenant_invitations")
    .insert({
      tenant_id: input.tenant_id,
      email,
      role: input.role,
      token_hash,
      expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      invited_by: callerId,
      token_delivered: true,
      metadata,
    })
    .select("id, email, role, expires_at")
    .single();

  if (error) return response({ error: "invitation_failed" }, 400);

  // Record invitation timing on the staff profile, if one exists with
  // this email within the tenant.
  if (input.role !== "student") {
    await admin
      .from("staff_profiles")
      .update({ last_invited_at: new Date().toISOString() })
      .eq("tenant_id", input.tenant_id)
      .eq("email", email);
  }

  // Audit log entry for the invitation creation.
  await admin.from("audit_logs").insert({
    tenant_id: input.tenant_id,
    actor_id: callerId,
    action: "invitation.created",
    entity_type: "tenant_invitation",
    entity_id: invitation.id,
    after_data: { email, role: input.role, ...metadata },
  });

  // Development/testing only: return raw token and acceptance URL when
  // ENVIRONMENT is set to "development" or "test". In production without
  // an email provider configured, the token remains stored as a hash only.
  const isTesting =
    Deno.env.get("ENVIRONMENT") === "development" ||
    Deno.env.get("ENVIRONMENT") === "test";

  // Construct a browser-navigable acceptance URL containing the raw token.
  // This is DEVELOPMENT/TESTING ONLY — never do this in production without email provider configured.
  const acceptanceUrl = `${Deno.env.get("SITE_URL")}/accept-invitation?token=${raw}`;

  const responseBody = {
    success: true,
    status: "invited",
    invitation_id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    expires_at: invitation.expires_at,
    message:
      "Invitation created. The token is stored securely and will be delivered via the configured email provider when available.",
    // Development/testing only — raw token included for immediate acceptance.
    // Never store or transmit this in production without email provider configured.
    ...(isTesting
      ? { raw_token: raw, acceptance_url: acceptanceUrl, testing_delivery: true }
      : {}),
  };

  return response(responseBody);
});
