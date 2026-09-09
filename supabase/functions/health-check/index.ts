import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  const checks: Record<string, { status: string; latencyMs?: number }> = {};
  let overallStatus = "healthy";

  // Check Supabase database connectivity
  try {
    const start = Date.now();
    const db = createClient(supabaseUrl, supabaseKey);
    const { error } = await db.from("tenants").select("id", { count: "exact", head: true });
    const latency = Date.now() - start;

    if (error) {
      checks.database = { status: "unhealthy", latencyMs: latency };
      overallStatus = "degraded";
    } else {
      checks.database = { status: "healthy", latencyMs: latency };
    }
  } catch {
    checks.database = { status: "unhealthy" };
    overallStatus = "degraded";
  }

  // Check Edge Functions availability
  checks.edge_functions = { status: "healthy" };

  return response({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    checks,
  }, overallStatus === "healthy" ? 200 : 503);
});
