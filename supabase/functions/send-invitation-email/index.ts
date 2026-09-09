import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SITE_URL = Deno.env.get("SITE_URL") || "https://timiretimzzy.github.io/school";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "noreply@edustack.app";
const FROM_NAME = Deno.env.get("FROM_NAME") || "EduStack";

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

async function sendViaResend(to: string, subject: string, html: string): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.log("RESEND_API_KEY not configured — email skipped");
    return false;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: [to],
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Resend API error:", err);
    return false;
  }
  return true;
}

function buildInvitationEmail(params: {
  tenantName: string;
  role: string;
  acceptanceUrl: string;
  invitedByName: string;
  expiryDays: number;
}): string {
  const roleLabel = params.role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #17243a;">
  <div style="text-align: center; padding: 24px 0;">
    <h1 style="color: #123c69; margin: 0;">EDUSTACK</h1>
    <p style="color: #666; margin: 4px 0 0;">FiscalStack Solutions</p>
  </div>
  <div style="background: #f4f7fb; border-radius: 12px; padding: 32px; margin: 24px 0;">
    <h2 style="margin-top:0;">You're invited to join ${params.tenantName}</h2>
    <p>${params.invitedByName} has invited you as a <strong>${roleLabel}</strong>.</p>
    <p>Click the button below to accept your invitation and set up your account:</p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${params.acceptanceUrl}" style="background: #123c69; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">Accept Invitation</a>
    </div>
    <p style="color: #666; font-size: 14px;">This invitation expires in ${params.expiryDays} days. If you did not expect this invitation, you can safely ignore this email.</p>
  </div>
  <div style="text-align: center; padding: 16px 0; color: #999; font-size: 12px;">
    <p>EduStack — School Management Platform</p>
    <p>FiscalStack Solutions</p>
  </div>
</body>
</html>`;
}

Deno.serve(async (request) => {
  try {
    if (request.method !== "POST") return response({ error: "method_not_allowed" }, 405);

    const authHeader = request.headers.get("authorization")?.replace("Bearer ", "");
    if (!authHeader) return response({ error: "unauthenticated" }, 401);

    const caller = await admin.auth.getUser(authHeader);
    if (caller.error || !caller.data.user) return response({ error: "unauthenticated" }, 401);

    const input = await request.json().catch(() => ({}));

    if (typeof input.invitation_id !== "string") {
      return response({ error: "invalid_input" }, 400);
    }

    // Look up the invitation
    const { data: invitation, error: invError } = await admin
      .from("tenant_invitations")
      .select("id, tenant_id, email, role, token_hash, expires_at, accepted_at, token_delivered")
      .eq("id", input.invitation_id)
      .maybeSingle();

    if (invError || !invitation) return response({ error: "invitation_not_found" }, 404);
    if (invitation.accepted_at) return response({ error: "invitation_already_accepted" }, 400);

    // Look up the tenant name
    const { data: tenant } = await admin
      .from("tenants")
      .select("name")
      .eq("id", invitation.tenant_id)
      .maybeSingle();

    // Look up the inviter's name
    const { data: inviterProfile } = await admin
      .from("staff_profiles")
      .select("first_name, last_name")
      .eq("user_id", caller.data.user.id)
      .eq("tenant_id", invitation.tenant_id)
      .maybeSingle();

    const inviterName = inviterProfile
      ? `${inviterProfile.first_name || ""} ${inviterProfile.last_name || ""}`.trim() || "School Administrator"
      : "School Administrator";

    // Generate a raw token for the acceptance URL
    // Since we only store hashes, we need to generate a new token for email delivery
    // The user will need to use the accept-invitation flow with this token
    const raw = crypto.randomUUID() + crypto.randomUUID();
    const acceptanceUrl = `${SITE_URL}/#/accept-invite?token=${raw}`;

    const emailHtml = buildInvitationEmail({
      tenantName: tenant?.name || "School",
      role: invitation.role,
      acceptanceUrl,
      invitedByName: inviterName,
      expiryDays: 7,
    });

    const emailSent = await sendViaResend(
      invitation.email,
      `You're invited to join ${tenant?.name || "School"} on EduStack`,
      emailHtml
    );

    // Update the invitation to mark delivery
    await admin
      .from("tenant_invitations")
      .update({ token_delivered: true })
      .eq("id", invitation.id);

    // Audit log
    await admin.from("audit_logs").insert({
      tenant_id: invitation.tenant_id,
      actor_id: caller.data.user.id,
      action: "invitation.email_sent",
      entity_type: "tenant_invitation",
      entity_id: invitation.id,
      after_data: { email: invitation.email, email_sent: emailSent },
    });

    return response({
      success: true,
      email_sent: emailSent,
      message: emailSent
        ? "Invitation email sent successfully."
        : "Email provider not configured. Please share the invitation link manually.",
      acceptance_url: acceptanceUrl,
    });
  } catch (err) {
    console.error("Edge Function error:", err);
    return response({ error: "internal_error" }, 500);
  }
});
