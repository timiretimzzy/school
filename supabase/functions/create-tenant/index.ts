import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const url = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const token = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return json({ error: "unauthenticated" }, 401);
  const caller = await admin.auth.getUser(token);
  if (caller.error) return json({ error: "unauthenticated" }, 401);
  const { data: platformAdmin } = await admin.from("platform_admins").select("user_id").eq("user_id", caller.data.user.id).maybeSingle();
  if (!platformAdmin) return json({ error: "forbidden" }, 403);
  const input = await request.json().catch(() => ({}));
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const slug = typeof input.slug === "string" ? input.slug.trim().toLowerCase() : "";
  if (name.length < 2 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return json({ error: "invalid_school_details" }, 400);
  const { data: tenant, error } = await admin.from("tenants").insert({ name, slug, motto: input.motto ?? null }).select().single();
  if (error) return json({ error: error.code === "23505" ? "slug_already_exists" : "tenant_creation_failed" }, 400);
  const branding = input.branding && typeof input.branding === "object" ? input.branding : {};
  await admin.from("tenant_branding").insert({ tenant_id: tenant.id, ...branding });
  const modules = Array.isArray(input.modules) ? input.modules.filter((m: unknown) => typeof m === "string") : [];
  if (modules.length) await admin.from("tenant_modules").insert(modules.map((module_key: string) => ({ tenant_id: tenant.id, module_key, enabled: true })));
  await admin.from("audit_logs").insert({ actor_id: caller.data.user.id, action: "tenant.created", entity_type: "tenant", entity_id: tenant.id, after_data: { name, slug } });
  return json({ tenant });
});
