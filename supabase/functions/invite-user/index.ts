import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
Deno.serve(async (request) => {
  const token = request.headers.get("authorization")?.replace("Bearer ", "");
  const caller = token && await admin.auth.getUser(token);
  if (!caller || caller.error) return response({ error: "unauthenticated" }, 401);
  const input = await request.json().catch(() => ({}));
  if (typeof input.tenant_id !== "string" || typeof input.email !== "string" || typeof input.role !== "string") return response({ error: "invalid_input" }, 400);
  const { data: membership } = await admin.from("tenant_memberships").select("role").eq("tenant_id", input.tenant_id).eq("user_id", caller.data.user.id).eq("active", true).in("role", ["school_admin", "principal"]).maybeSingle();
  const { data: platform } = await admin.from("platform_admins").select("user_id").eq("user_id", caller.data.user.id).maybeSingle();
  if (!membership && !platform) return response({ error: "forbidden" }, 403);
  const raw = crypto.randomUUID() + crypto.randomUUID();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  const token_hash = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  const { error } = await admin.from("tenant_invitations").insert({ tenant_id: input.tenant_id, email: input.email.trim().toLowerCase(), role: input.role, token_hash, expires_at: new Date(Date.now() + 7 * 86400000).toISOString(), invited_by: caller.data.user.id });
  if (error) return response({ error: "invitation_failed" }, 400);
  return response({ invitation_created: true });
});
