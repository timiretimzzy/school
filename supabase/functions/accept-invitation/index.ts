import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

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

// Rate limiting for accept-invitation
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

async function hash(raw: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Accepts a pending tenant_invitations row (identified by its raw token) for
// the currently authenticated user, creates the tenant_memberships row, and
// optionally links a student/parent profile. Must run with the service role
// because granting membership is a privileged, cross-tenant operation.
Deno.serve(async (request) => {
  const corsHeaders = getCorsHeaders(request);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, corsHeaders);

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!checkRateLimit(ip)) return json({ error: "rate_limited" }, 429, corsHeaders);

  const authToken = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!authToken) return json({ error: "unauthenticated" }, 401, corsHeaders);
  const caller = await admin.auth.getUser(authToken);
  if (caller.error || !caller.data.user) return json({ error: "unauthenticated" }, 401, corsHeaders);

  const input = await request.json().catch(() => ({}));
  if (typeof input.token !== "string" || input.token.length < 10) return json({ error: "invalid_input" }, 400, corsHeaders);
  const token_hash = await hash(input.token);

  const { data: invitation, error: lookupError } = await admin
    .from("tenant_invitations")
    .select("id, tenant_id, email, role, expires_at, accepted_at, metadata")
    .eq("token_hash", token_hash)
    .maybeSingle();
  if (lookupError || !invitation) return json({ error: "invitation_not_found" }, 404, corsHeaders);
  if (invitation.accepted_at) return json({ error: "invitation_already_accepted" }, 400, corsHeaders);
  if (new Date(invitation.expires_at).getTime() < Date.now()) return json({ error: "invitation_expired" }, 400, corsHeaders);
  if ((caller.data.user.email ?? "").toLowerCase() !== invitation.email.toLowerCase()) {
    return json({ error: "email_mismatch" }, 403, corsHeaders);
  }

  const { error: membershipError } = await admin
    .from("tenant_memberships")
    .upsert(
      { tenant_id: invitation.tenant_id, user_id: caller.data.user.id, role: invitation.role, active: true },
      { onConflict: "tenant_id,user_id,role" },
    );
  if (membershipError) return json({ error: "membership_failed" }, 400, corsHeaders);

  // For student invitations, auto-link to the student profile if the
  // invite-user function stored a student_id in the invitation metadata,
  // or if the accepting client supplied one explicitly.
  if (invitation.role === "student") {
    const studentId =
      typeof input.student_id === "string" && input.student_id
        ? input.student_id
        : invitation.metadata?.student_id;
    if (typeof studentId === "string" && studentId) {
      await admin.from("student_links").upsert(
        {
          tenant_id: invitation.tenant_id,
          student_id: studentId,
          user_id: caller.data.user.id,
          relationship: "self",
        },
        { onConflict: "student_id,user_id" },
      );
    }
  }

  if (invitation.role === "parent") {
    const { data: parent } = await admin
      .from("parent_profiles")
      .upsert(
        {
          tenant_id: invitation.tenant_id,
          user_id: caller.data.user.id,
          first_name: typeof input.first_name === "string" ? input.first_name : "Parent",
          last_name: typeof input.last_name === "string" ? input.last_name : "Guardian",
        },
        { onConflict: "tenant_id,user_id" },
      )
      .select()
      .single();
    const studentIds: string[] = Array.isArray(input.student_ids)
      ? input.student_ids.filter((s: unknown) => typeof s === "string")
      : [];
    if (parent && studentIds.length) {
      await admin.from("parent_student_relationships").upsert(
        studentIds.map((student_id) => ({ tenant_id: invitation.tenant_id, parent_id: parent.id, student_id })),
        { onConflict: "parent_id,student_id" },
      );
    }
  }

  await admin.from("tenant_invitations").update({ accepted_at: new Date().toISOString() }).eq("id", invitation.id);
  await admin.from("audit_logs").insert({
    tenant_id: invitation.tenant_id,
    actor_id: caller.data.user.id,
    action: "invitation.accepted",
    entity_type: "tenant_invitation",
    entity_id: invitation.id,
  });

  return json({ accepted: true, tenant_id: invitation.tenant_id, role: invitation.role }, 200, corsHeaders);
});
