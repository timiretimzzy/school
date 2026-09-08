import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, supabaseAnonKey);
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

const DEFAULT_PASSWORD_MAP: Record<string, string> = {
  STU: "Student@123!",
  TCH: "Teacher@123!",
  PAR: "Parent@123!",
};

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
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const input = await request.json().catch(() => ({}));

  if (typeof input.login_id !== "string" || typeof input.password !== "string") {
    return response({ error: "invalid_input" }, 400);
  }

  const normalized = normalizeLoginId(input.login_id);
  if (!normalized) {
    return response({ error: "invalid_login_id_format" }, 400);
  }

  const { canonical, legacy, prefix } = normalized;
  const password = input.password.trim();

  let authUserId: string | null = null;
  let email: string | null = null;
  let foundRole: string | null = null;
  let foundTable: string | null = null;

  if (prefix === "STU") {
    const { data, error } = await admin
      .from("students")
      .select("id")
      .or(`login_id.eq.${canonical},login_id.eq.${legacy}`)
      .maybeSingle();
    if (!error && data?.id) {
      authUserId = data.id;
      foundTable = "students";
    }
  } else if (prefix === "TCH") {
    const { data, error } = await admin
      .from("staff_profiles")
      .select("user_id")
      .or(`login_id.eq.${canonical},login_id.eq.${legacy}`)
      .maybeSingle();
    if (!error && data?.user_id) {
      authUserId = data.user_id;
      foundTable = "staff_profiles";
    }
  } else if (prefix === "PAR") {
    const { data, error } = await admin
      .from("parent_profiles")
      .select("user_id")
      .or(`login_id.eq.${canonical},login_id.eq.${legacy}`)
      .maybeSingle();
    if (!error && data?.user_id) {
      authUserId = data.user_id;
      foundTable = "parent_profiles";
    }
  }

  if (!authUserId) {
    return response({ error: "invalid_credentials" }, 401);
  }

  const { data: authData, error: authErr } = await admin.auth.admin.getUserById(authUserId);
  if (authErr || !authData?.user?.email) {
    return response({ error: "invalid_credentials" }, 401);
  }

  email = authData.user.email;
  foundRole = input.role || determineRoleFromPrefix(prefix);

  const { data: signIn, error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError || !signIn.user) {
    return response({ error: "invalid_credentials" }, 401);
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
    user: {
      id: signIn.user.id,
      email: signIn.user.email,
    },
    session: signIn.session,
    must_change_password: mustChangePassword,
    default_password: DEFAULT_PASSWORD_MAP[prefix],
    role: foundRole,
    login_id: canonical,
    table: foundTable,
  });
});