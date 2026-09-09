import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SITE_URL = Deno.env.get("SITE_URL") || "https://timiretimzzy.github.io/school";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "noreply@edustack.app";
const FROM_NAME = Deno.env.get("FROM_NAME") || "EduStack";

const ALLOWED_ORIGINS = [
  "https://timiretimzzy.github.io",
  "https://school-kohl-two.vercel.app",
  "http://localhost:8080",
  "http://localhost:3000",
];

function getCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin") || "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Credentials": "true",
  };
}

const response = (body: unknown, status = 200, corsHeaders: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders },
  });

async function hashToken(raw: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sendInvitationEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!RESEND_API_KEY) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: `${FROM_NAME} <${FROM_EMAIL}>`, to: [to], subject, html }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function buildEmailHtml(params: { tenantName: string; role: string; url: string; inviterName: string; expiryDays: number }) {
  const roleLabel = params.role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#17243a;">
<div style="text-align:center;padding:24px 0"><h1 style="color:#123c69;margin:0">EDUSTACK</h1><p style="color:#666;margin:4px 0 0">FiscalStack Solutions</p></div>
<div style="background:#f4f7fb;border-radius:12px;padding:32px;margin:24px 0">
<h2 style="margin-top:0">You're invited to join ${params.tenantName}</h2>
<p>${params.inviterName} has invited you as a <strong>${roleLabel}</strong>.</p>
<p>Click the button below to accept your invitation and set up your account:</p>
<div style="text-align:center;margin:32px 0"><a href="${params.url}" style="background:#123c69;color:white;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">Accept Invitation</a></div>
<p style="color:#666;font-size:14px">This invitation expires in ${params.expiryDays} days. If you did not expect this, you can safely ignore this email.</p>
</div>
<div style="text-align:center;padding:16px 0;color:#999;font-size:12px"><p>EduStack — School Management Platform</p></div>
</body></html>`;
}

Deno.serve(async (request) => {
  const corsHeaders = getCorsHeaders(request);
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const authHeader = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!authHeader) return response({ error: "unauthenticated" }, 401, corsHeaders);

  const caller = await admin.auth.getUser(authHeader);
  if (caller.error || !caller.data.user) return response({ error: "unauthenticated" }, 401, corsHeaders);

  const input = await request.json().catch(() => ({}));

  if (typeof input.tenant_id !== "string" || typeof input.email !== "string" || typeof input.role !== "string") {
    return response({ error: "invalid_input" }, 400, corsHeaders);
  }

  const callerId = caller.data.user.id;
  const email = input.email.trim().toLowerCase();

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
    return response({ error: "forbidden" }, 403, corsHeaders);
  }

  const SCHOOL_ROLES = ["school_admin", "principal", "registrar", "teacher", "finance_officer", "librarian", "parent", "student"];
  if (!platformAdmin && !SCHOOL_ROLES.includes(input.role)) {
    return response({ error: "forbidden" }, 403, corsHeaders);
  }

  const metadata: Record<string, unknown> = {};
  if (input.role === "student" && typeof input.student_id === "string" && input.student_id) {
    metadata.student_id = input.student_id;
  }

  const { data: existing } = await admin
    .from("tenant_invitations")
    .select("id, accepted_at, expires_at")
    .eq("tenant_id", input.tenant_id)
    .eq("email", email)
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (existing) {
    return response({ error: "invitation_exists", invitation_id: existing.id }, 409, corsHeaders);
  }

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
      token_delivered: false,
      metadata,
    })
    .select("id, email, role, expires_at")
    .single();

  if (error) return response({ error: "invitation_failed" }, 400, corsHeaders);

  if (input.role !== "student") {
    await admin
      .from("staff_profiles")
      .update({ last_invited_at: new Date().toISOString() })
      .eq("tenant_id", input.tenant_id)
      .eq("email", email);
  }

  await admin.from("audit_logs").insert({
    tenant_id: input.tenant_id,
    actor_id: callerId,
    action: "invitation.created",
    entity_type: "tenant_invitation",
    entity_id: invitation.id,
    after_data: { email, role: input.role, ...metadata },
  });

  // --- Send invitation email ---
  const acceptanceUrl = `${SITE_URL}/#/accept-invite?token=${raw}`;
  let emailSent = false;

  const { data: tenant } = await admin.from("tenants").select("name").eq("id", input.tenant_id).maybeSingle();
  const { data: inviterProfile } = await admin
    .from("staff_profiles").select("first_name, last_name")
    .eq("user_id", callerId).eq("tenant_id", input.tenant_id).maybeSingle();
  const inviterName = inviterProfile ? `${inviterProfile.first_name || ""} ${inviterProfile.last_name || ""}`.trim() || "School Administrator" : "School Administrator";

  emailSent = await sendInvitationEmail(
    email,
    `You're invited to join ${tenant?.name || "School"} on EduStack`,
    buildInvitationEmail({ tenantName: tenant?.name || "School", role: input.role, url: acceptanceUrl, inviterName, expiryDays: 7 })
  );

  if (emailSent) {
    await admin.from("tenant_invitations").update({ token_delivered: true }).eq("id", invitation.id);
  }

  const isTesting = Deno.env.get("ENVIRONMENT") === "development" || Deno.env.get("ENVIRONMENT") === "test";

  return response({
    success: true,
    status: "invited",
    invitation_id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    expires_at: invitation.expires_at,
    email_sent: emailSent,
    message: emailSent
      ? "Invitation created and email sent."
      : "Invitation created. Email provider not configured — please share the invitation link manually.",
    ...(isTesting ? { raw_token: raw, acceptance_url: acceptanceUrl, testing_delivery: true } : {}),
    ...(!emailSent && !isTesting ? { acceptance_url: acceptanceUrl } : {}),
  }, 200, corsHeaders);
});

function buildInvitationEmail(params: { tenantName: string; role: string; url: string; inviterName: string; expiryDays: number }) {
  return buildEmailHtml(params);
}
