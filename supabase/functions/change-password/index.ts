import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(supabaseUrl, serviceRoleKey);

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

function validatePasswordStrength(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (password.length > 128) return "Password must not exceed 128 characters.";
  if (!/[A-Z]/.test(password)) return "Password must contain at least one uppercase letter.";
  if (!/[a-z]/.test(password)) return "Password must contain at least one lowercase letter.";
  if (!/[0-9]/.test(password)) return "Password must contain at least one digit.";
  if (!/[^A-Za-z0-9]/.test(password)) return "Password must contain at least one special character.";
  return null;
}

Deno.serve(async (request) => {
  const corsHeaders = getCorsHeaders(request);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const authHeader = request.headers.get("authorization")?.replace("Bearer ", "");
    if (!authHeader) return response({ error: "unauthenticated" }, 401, corsHeaders);

    const caller = await admin.auth.getUser(authHeader);
    if (caller.error || !caller.data.user) return response({ error: "unauthenticated" }, 401, corsHeaders);

    const userId = caller.data.user.id;
    const input = await request.json().catch(() => ({}));

    if (typeof input.new_password !== "string") {
      return response({ error: "invalid_password" }, 400, corsHeaders);
    }

    const validationError = validatePasswordStrength(input.new_password);
    if (validationError) {
      return response({ error: validationError }, 400, corsHeaders);
    }

    // Verify current password unless this is a forced first-time change
    const { data: membership } = await admin
      .from("tenant_memberships")
      .select("must_change_password")
      .eq("user_id", userId)
      .eq("active", true)
      .maybeSingle();

    if (!membership?.must_change_password && typeof input.current_password === "string") {
      // Verify current password by attempting sign-in with Supabase anon client
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const anonClient = createClient(supabaseUrl, anonKey);
      const { error: signInErr } = await anonClient.auth.signInWithPassword({
        email: caller.data.user.email || "",
        password: input.current_password,
      });
      if (signInErr) {
        return response({ error: "current_password_incorrect" }, 400, corsHeaders);
      }
    }

    const { error: updateErr } = await admin.auth.admin.updateUserById(userId, {
      password: input.new_password,
    });

    if (updateErr) {
      return response({ error: "password_update_failed" }, 400, corsHeaders);
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
    }, 200, corsHeaders);
  } catch (err) {
    console.error("Edge Function error:", err);
    return response({ error: "internal_error" }, 500, corsHeaders);
  }
});
