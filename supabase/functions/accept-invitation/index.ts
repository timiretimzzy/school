import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

async function hash(raw: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Accepts a pending tenant_invitations row (identified by its raw token) for
// the currently authenticated user, creates the tenant_memberships row, and
// optionally links a student/parent profile. Must run with the service role
// because granting membership is a privileged, cross-tenant operation.
Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const authToken = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!authToken) return json({ error: "unauthenticated" }, 401);
  const caller = await admin.auth.getUser(authToken);
  if (caller.error || !caller.data.user) return json({ error: "unauthenticated" }, 401);

  const input = await request.json().catch(() => ({}));
  if (typeof input.token !== "string" || input.token.length < 10) return json({ error: "invalid_input" }, 400);
  const token_hash = await hash(input.token);

  const { data: invitation, error: lookupError } = await admin
    .from("tenant_invitations")
    .select("id, tenant_id, email, role, expires_at, accepted_at")
    .eq("token_hash", token_hash)
    .maybeSingle();
  if (lookupError || !invitation) return json({ error: "invitation_not_found" }, 404);
  if (invitation.accepted_at) return json({ error: "invitation_already_accepted" }, 400);
  if (new Date(invitation.expires_at).getTime() < Date.now()) return json({ error: "invitation_expired" }, 400);
  if ((caller.data.user.email ?? "").toLowerCase() !== invitation.email.toLowerCase()) {
    return json({ error: "email_mismatch" }, 403);
  }

  const { error: membershipError } = await admin
    .from("tenant_memberships")
    .upsert(
      { tenant_id: invitation.tenant_id, user_id: caller.data.user.id, role: invitation.role, active: true },
      { onConflict: "tenant_id,user_id,role" },
    );
  if (membershipError) return json({ error: "membership_failed" }, 400);

  if (invitation.role === "student" && typeof input.student_id === "string") {
    await admin.from("student_links").upsert({
      tenant_id: invitation.tenant_id,
      student_id: input.student_id,
      user_id: caller.data.user.id,
      relationship: "self",
    });
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

  return json({ accepted: true, tenant_id: invitation.tenant_id, role: invitation.role });
});
