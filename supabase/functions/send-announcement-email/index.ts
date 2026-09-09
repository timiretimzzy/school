import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
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

const json = (body: unknown, status = 200, corsHeaders: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...corsHeaders } });

async function sendViaResend(to: string, subject: string, html: string): Promise<boolean> {
  if (!RESEND_API_KEY) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: `${FROM_NAME} <${FROM_EMAIL}>`, to: [to], subject, html }),
  });
  return res.ok;
}

function buildAnnouncementEmail(tenantName: string, title: string, body: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#17243a">
  <div style="text-align:center;padding:24px 0">
    <h1 style="color:#123c69;margin:0">EDUSTACK</h1>
    <p style="color:#666;margin:4px 0 0">${tenantName}</p>
  </div>
  <div style="background:#f4f7fb;border-radius:12px;padding:32px;margin:24px 0">
    <h2 style="margin-top:0">${title}</h2>
    <p style="font-size:15px;line-height:1.6">${body.replace(/\n/g, "<br>")}</p>
  </div>
  <div style="text-align:center;padding:16px 0;color:#999;font-size:12px">
    <p>EduStack — School Management Platform</p>
  </div>
</body>
</html>`;
}

Deno.serve(async (request) => {
  const corsHeaders = getCorsHeaders(request);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, corsHeaders);

  try {
    const authHeader = request.headers.get("authorization")?.replace("Bearer ", "");
    if (!authHeader) return json({ error: "unauthenticated" }, 401, corsHeaders);
    const caller = await admin.auth.getUser(authHeader);
    if (caller.error || !caller.data.user) return json({ error: "unauthenticated" }, 401, corsHeaders);

    const input = await request.json().catch(() => ({}));
    const { tenant_id, title, body: emailBody, audience } = input;
    if (!tenant_id || !title) return json({ error: "invalid_input" }, 400, corsHeaders);

    const { data: tenant } = await admin.from("tenants").select("name").eq("id", tenant_id).maybeSingle();
    const tenantName = tenant?.name || "School";

    let emails: string[] = [];
    if (audience === "parents" || audience === "all") {
      const { data: parentProfiles } = await admin.from("parent_profiles").select("user_id").eq("tenant_id", tenant_id);
      const userIds = (parentProfiles || []).map((p) => p.user_id).filter(Boolean);
      if (userIds.length) {
        const allUsers = await admin.auth.admin.listUsers();
        emails = (allUsers?.data?.users || [])
          .filter((u) => userIds.includes(u.id))
          .map((u) => u.email)
          .filter(Boolean);
      }
    }

    if (!emails.length) {
      return json({ success: true, sent: 0, message: "No recipients found for this audience." }, 200, corsHeaders);
    }

    let sent = 0;
    for (const email of emails) {
      const ok = await sendViaResend(email, `${tenantName} — ${title}`, buildAnnouncementEmail(tenantName, title, emailBody || ""));
      if (ok) sent++;
    }

    await admin.from("audit_logs").insert({
      tenant_id, actor_id: caller.data.user.id, action: "announcement.email_sent",
      entity_type: "announcement", after_data: { title, audience, sent },
    });

    return json({ success: true, sent, total: emails.length }, 200, corsHeaders);
  } catch (err) {
    console.error("Edge Function error:", err);
    return json({ error: "internal_error" }, 500, corsHeaders);
  }
});
