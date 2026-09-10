import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Credentials": "true",
  };
}

const response = (body: unknown, status = 200, corsHeaders: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders },
  });

Deno.serve(async (request) => {
  const corsHeaders = getCorsHeaders(request);
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(request.url);
  const domain = url.searchParams.get("domain");

  if (!domain) {
    return response({ error: "missing_domain parameter" }, 400, corsHeaders);
  }

  const { data, error } = await supabase
    .from("tenant_domains")
    .select("tenant_id, domain, is_primary")
    .eq("domain", domain.toLowerCase().trim())
    .maybeSingle();

  if (error || !data) {
    return response({ resolved: false, domain }, 200, corsHeaders);
  }

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, name, slug, status")
    .eq("id", data.tenant_id)
    .maybeSingle();

  if (!tenant || tenant.status !== "active") {
    return response({ resolved: false, domain }, 200, corsHeaders);
  }

  return response({
    resolved: true,
    tenant_id: tenant.id,
    tenant_name: tenant.name,
    slug: tenant.slug,
    domain: data.domain,
    is_primary: data.is_primary,
  }, 200, corsHeaders);
});
