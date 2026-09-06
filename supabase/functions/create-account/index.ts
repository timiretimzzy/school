import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const DEFAULT_PASSWORD_MAP: Record<string, string> = {
  student: "Student@123!",
  teacher: "Teacher@123!",
  parent: "Parent@123!",
};

function getDefaultPassword(role: string): string {
  const roleLower = role.toLowerCase();
  if (roleLower === "student" || roleLower === "s") return DEFAULT_PASSWORD_MAP.student;
  if (roleLower === "teacher" || roleLower === "t") return DEFAULT_PASSWORD_MAP.teacher;
  if (roleLower === "parent" || roleLower === "p") return DEFAULT_PASSWORD_MAP.parent;
  return "TempPass123!";
}

function getRolePrefix(role: string): string {
  const roleLower = role.toLowerCase();
  if (roleLower === "student" || roleLower === "s") return "STU";
  if (roleLower === "teacher" || roleLower === "t") return "TCH";
  if (roleLower === "parent" || roleLower === "p") return "PAR";
  return "STU";
}

function extractNumber(str: string): number {
  if (!str) return 0;
  const match = str.match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
}

async function cleanupAuthUser(userId: string) {
  try {
    await admin.auth.admin.deleteUser(userId);
    return true;
  } catch (err) {
    console.error("Failed to cleanup auth user:", err);
    return false;
  }
}

async function cleanupProfile(table: string, userId: string) {
  try {
    if (table === "students") {
      await admin.from(table).delete().eq("id", userId);
    } else {
      await admin.from(table).delete().eq("user_id", userId);
    }
    return true;
  } catch (err) {
    console.error(`Failed to cleanup ${table}:`, err);
    return false;
  }
}

Deno.serve(async (request) => {
  try {
    const authHeader = request.headers.get("authorization")?.replace("Bearer ", "");
    if (!authHeader) return response({ error: "unauthenticated" }, 401);

    const caller = await admin.auth.getUser(authHeader);
    if (caller.error || !caller.data.user) return response({ error: "unauthenticated" }, 401);

    const callerId = caller.data.user.id;
    const input = await request.json().catch(() => ({}));

    if (typeof input.tenant_id !== "string" || typeof input.email !== "string" || typeof input.role !== "string") {
      return response({ error: "invalid_input" }, 400);
    }

    const email = input.email.trim().toLowerCase();

    const { data: membership } = await admin
      .from("tenant_memberships")
      .select("role")
      .eq("tenant_id", input.tenant_id)
      .eq("user_id", callerId)
      .eq("active", true)
      .in("role", ["school_admin", "principal"])
      .maybeSingle();

    const { data: platformAdmin } = await admin
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", callerId)
      .maybeSingle();

    if (!membership && !platformAdmin) {
      return response({ error: "forbidden" }, 403);
    }

    const SCHOOL_ROLES = ["school_admin", "principal", "registrar", "teacher", "finance_officer", "librarian", "parent", "student"];
    if (!platformAdmin && !SCHOOL_ROLES.includes(input.role)) {
      return response({ error: "forbidden" }, 403);
    }

    const defaultPassword = getDefaultPassword(input.role);
    const password = input.password || defaultPassword;

    const { data: userList, error: listErr } = await admin.auth.admin.listUsers();
    if (listErr) return response({ error: "user_lookup_failed", details: listErr.message }, 500);

    const existingUser = userList.users.find((u) => u.email === email);

    let user;
    let authUserCreated = false;

    if (existingUser) {
      user = existingUser;
      try {
        await admin.auth.admin.updateUserById(user.id, { password });
      } catch (err) {
        console.error("Failed to update existing user password:", err);
      }
    } else {
      const { data: newUser, error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (createError) return response({ error: "user_creation_failed", details: createError.message }, 400);
      user = newUser.user;
      authUserCreated = true;
    }

    let loginId;
    try {
      const { data: rpcData, error: rpcError } = await admin.rpc("generate_login_id", {
        prefix: getRolePrefix(input.role),
      });
      if (rpcError) {
        if (authUserCreated) await cleanupAuthUser(user.id);
        return response({ error: "login_id_generation_failed" }, 400);
      }
      loginId = rpcData;
    } catch (err) {
      if (authUserCreated) await cleanupAuthUser(user.id);
      return response({ error: "login_id_generation_error" }, 500);
    }

    let profileTable: string | null = null;

    if (input.role === "student") {
      profileTable = "students";
      let admissionNumber = null;
      const { data: maxAdm, error: maxAdmErr } = await admin
        .from("students")
        .select("admission_number")
        .eq("tenant_id", input.tenant_id)
        .order("admission_number", { ascending: false })
        .limit(1);
      if (maxAdmErr) {
        if (authUserCreated) await cleanupAuthUser(user.id);
        return response({ error: "admission_number_query_failed", details: maxAdmErr.message }, 500);
      }
      const nextNum = maxAdm && maxAdm[0]?.admission_number
        ? extractNumber(maxAdm[0].admission_number) + 1
        : 1;
      admissionNumber = `STU${String(nextNum).padStart(6, "0")}`;

      const { error: profileError } = await admin
        .from("students")
        .upsert({
          id: user.id,
          email,
          login_id: loginId,
          tenant_id: input.tenant_id,
          admission_number: admissionNumber,
          first_name: email.split("@")[0],
          last_name: "",
          status: "active",
        }, { onConflict: "id" });
      if (profileError) {
        if (authUserCreated) await cleanupAuthUser(user.id);
        return response({ error: "profile_creation_failed", details: profileError.message }, 400);
      }
    } else if (input.role === "teacher") {
      profileTable = "staff_profiles";
      let employeeNumber = null;
      const { data: maxEmp, error: maxEmpErr } = await admin
        .from("staff_profiles")
        .select("employee_number")
        .eq("tenant_id", input.tenant_id)
        .order("employee_number", { ascending: false })
        .limit(1);
      if (maxEmpErr) {
        if (authUserCreated) await cleanupAuthUser(user.id);
        return response({ error: "employee_number_query_failed", details: maxEmpErr.message }, 500);
      }
      const nextNum = maxEmp && maxEmp[0]?.employee_number
        ? extractNumber(maxEmp[0].employee_number) + 1
        : 1;
      employeeNumber = `TCH${String(nextNum).padStart(6, "0")}`;

      const { error: profileError } = await admin
        .from("staff_profiles")
        .upsert({
          id: user.id,
          tenant_id: input.tenant_id,
          user_id: user.id,
          employee_number: employeeNumber,
          login_id: loginId,
          first_name: email.split("@")[0],
          last_name: "",
          department: "General",
          job_title: "Teacher",
          active: true,
        }, { onConflict: "id" });
      if (profileError) {
        if (authUserCreated) await cleanupAuthUser(user.id);
        return response({ error: "profile_creation_failed", details: profileError.message }, 400);
      }
    } else if (input.role === "parent") {
      profileTable = "parent_profiles";

      const { error: profileError } = await admin
        .from("parent_profiles")
        .upsert({
          id: user.id,
          tenant_id: input.tenant_id,
          user_id: user.id,
          login_id: loginId,
          first_name: email.split("@")[0],
          last_name: "",
        }, { onConflict: "id" });
      if (profileError) {
        if (authUserCreated) await cleanupAuthUser(user.id);
        return response({ error: "profile_creation_failed", details: profileError.message }, 400);
      }
    }

    const { error: membershipError } = await admin
      .from("tenant_memberships")
      .upsert(
        {
          tenant_id: input.tenant_id,
          user_id: user.id,
          role: input.role,
          active: true,
          must_change_password: true,
        },
        { onConflict: "tenant_id,user_id,role" }
      );

    if (membershipError) {
      if (profileTable) await cleanupProfile(profileTable, user.id);
      if (authUserCreated) await cleanupAuthUser(user.id);
      return response({ error: "membership_creation_failed" }, 400);
    }

    await admin.from("audit_logs").insert({
      tenant_id: input.tenant_id,
      actor_id: callerId,
      action: "account.created",
      entity_type: "tenant_membership",
      entity_id: user.id,
      after_data: { email, role: input.role, login_id: loginId, must_change_password: true },
    });

    const isTesting =
      Deno.env.get("ENVIRONMENT") === "development" ||
      Deno.env.get("ENVIRONMENT") === "test";

    const responseBody: Record<string, unknown> = {
      success: true,
      user_id: user.id,
      login_id: loginId,
      email: user.email,
      role: input.role,
      tenant_id: input.tenant_id,
      must_change_password: true,
      message: "Account created successfully. The user must change their password on first login.",
      default_password: password,
    };

    if (isTesting) {
      responseBody.testing_delivery = true;
    }

    if (password !== (input.password || "")) {
      responseBody.password_updated = true;
    }

    return response(responseBody);
  } catch (err) {
    console.error("Edge Function error:", err);
    return response({ error: "internal_error", details: String(err) }, 500);
  }
});