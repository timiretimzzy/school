import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, supabaseAnonKey);
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

// --- Rate limiting via in-memory map (resets on cold start, acceptable for MVP) ---
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 5;
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

function normalizeLoginId(input: string): { canonical: string; legacy: string; prefix: string } | null {
  const trimmed = input.trim().toUpperCase();
  const canonicalMatch = trimmed.match(/^([A-Z]{3})-([A-Z0-9]{6})$/);
  if (canonicalMatch) {
    return { canonical: trimmed, legacy: canonicalMatch[1] + canonicalMatch[2], prefix: canonicalMatch[1] };
  }
  const legacyMatch = trimmed.match(/^([A-Z]{3})([A-Z0-9]{6})$/);
  if (legacyMatch) {
    return { canonical: legacyMatch[1] + "-" + legacyMatch[2], legacy: trimmed, prefix: legacyMatch[1] };
  }
  return null;
}

function determineRoleFromPrefix(prefix: string): string | null {
  switch (prefix) {
    case "STU": return "student";
    case "TCH": return "teacher";
    case "PAR": return "parent";
    default: return null;
  }
}

Deno.serve(async (request) => {
  const corsHeaders = getCorsHeaders(request);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!checkRateLimit(ip)) {
    return response({ error: "rate_limited" }, 429, corsHeaders);
  }

  const input = await request.json().catch(() => ({}));

  if (typeof input.login_id !== "string" || typeof input.password !== "string") {
    return response({ error: "invalid_input" }, 400, corsHeaders);
  }

  const normalized = normalizeLoginId(input.login_id);
  if (!normalized) {
    return response({ error: "invalid_login_id_format" }, 400, corsHeaders);
  }

  const { canonical, legacy, prefix } = normalized;
  const password = input.password.trim();

  let authUserId: string | null = null;
  let foundRole: string | null = null;

  if (prefix === "STU") {
    const { data, error } = await admin
      .from("students")
      .select("id")
      .or(`login_id.eq.${canonical},login_id.eq.${legacy}`)
      .maybeSingle();
    if (!error && data?.id) {
      authUserId = data.id;
    }
  } else if (prefix === "TCH") {
    const { data, error } = await admin
      .from("staff_profiles")
      .select("user_id")
      .or(`login_id.eq.${canonical},login_id.eq.${legacy}`)
      .maybeSingle();
    if (!error && data?.user_id) {
      authUserId = data.user_id;
    }
  } else if (prefix === "PAR") {
    const { data, error } = await admin
      .from("parent_profiles")
      .select("user_id")
      .or(`login_id.eq.${canonical},login_id.eq.${legacy}`)
      .maybeSingle();
    if (!error && data?.user_id) {
      authUserId = data.user_id;
    }
  }

  if (!authUserId) {
    return response({ error: "invalid_credentials" }, 401, corsHeaders);
  }

  const { data: authData, error: authErr } = await admin.auth.admin.getUserById(authUserId);
  if (authErr || !authData?.user?.email) {
    return response({ error: "invalid_credentials" }, 401, corsHeaders);
  }

  const email = authData.user.email;
  foundRole = input.role || determineRoleFromPrefix(prefix);

  const { data: signIn, error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError || !signIn.user) {
    return response({ error: "invalid_credentials" }, 401, corsHeaders);
  }

  let mustChangePassword = false;

  if (signIn.user) {
    const { data: membership, error: memErr } = await admin
      .from("tenant_memberships")
      .select("must_change_password, role, active")
      .eq("user_id", signIn.user.id)
      .eq("active", true)
      .maybeSingle();

    if (!memErr && membership?.must_change_password === true) {
      mustChangePassword = true;
    }
    if (membership?.role) {
      foundRole = membership.role;
    }
  }

  return response({
    success: true,
    user: { id: signIn.user.id, email: signIn.user.email },
    session: signIn.session,
    must_change_password: mustChangePassword,
    role: foundRole,
    login_id: canonical,
  }, 200, corsHeaders);
});
