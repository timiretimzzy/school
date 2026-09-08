import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(supabaseUrl, serviceRoleKey);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS_HEADERS },
  });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    const authHeader = request.headers.get("authorization")?.replace("Bearer ", "");
    if (!authHeader) return response({ error: "unauthenticated" }, 401);

    const caller = await admin.auth.getUser(authHeader);
    if (caller.error || !caller.data.user) return response({ error: "unauthenticated" }, 401);

    const userId = caller.data.user.id;
    const input = await request.json().catch(() => ({}));

    if (typeof input.new_password !== "string" || input.new_password.length < 8) {
      return response({ error: "invalid_password" }, 400);
    }

    const { error: updateErr } = await admin.auth.admin.updateUserById(userId, {
      password: input.new_password,
    });

    if (updateErr) {
      return response({ error: "password_update_failed", details: updateErr.message }, 400);
    }

    const { error: membershipErr } = await admin
      .from("tenant_memberships")
      .update({
        must_change_password: false,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("active", true);

    if (membershipErr) {
      console.error("Failed to update must_change_password:", membershipErr);
    }

    return response({
      success: true,
      message: "Password changed successfully",
      must_change_password: false,
    });
  } catch (err) {
    console.error("Edge Function error:", err);
    return response({ error: "internal_error", details: String(err) }, 500);
  }
});