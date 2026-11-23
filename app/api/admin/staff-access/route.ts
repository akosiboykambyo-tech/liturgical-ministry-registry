import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "Vary": "Authorization",
  "X-Content-Type-Options": "nosniff",
};

const ROLE_CODES = [
  "registry_administrator",
  "cowl_financial_workspace_viewer",
  "curia_financial_workspace_viewer",
] as const;
type RoleCode = (typeof ROLE_CODES)[number];
type Action = "invite" | "grant" | "revoke";
type StaffRequest = {
  action?: unknown; email?: unknown; userId?: unknown; role?: unknown; reason?: unknown;
};

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: HEADERS });
}

function roleCode(value: unknown): value is RoleCode {
  return typeof value === "string" && (ROLE_CODES as readonly string[]).includes(value);
}

function validEmail(value: unknown): value is string {
  return typeof value === "string" && value.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && !/[\r\n<>]/.test(value);
}

function validUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function safeReason(value: unknown): value is string {
  return typeof value === "string" && value.trim().length >= 12 &&
    value.trim().length <= 500 && !/[\r\n\x00-\x08]/.test(value);
}

function activeProvisioner(rows: Array<{
  role_code?: string; granted_at?: string; revoked_at?: string | null;
  expires_at?: string | null;
}>, now: number) {
  return rows.some(row => {
    const start = Date.parse(row.granted_at ?? "");
    const end = row.expires_at ? Date.parse(row.expires_at) : Infinity;
    return row.role_code === "platform_provisioner" && !row.revoked_at &&
      Number.isFinite(start) && !Number.isNaN(end) && start <= now && end > now;
  });
}

/**
 * Every request requires BOTH an authenticated, active Registry Administrator
 * and an independently approved, active platform_provisioner grant.
 * No trust is placed in user_metadata, email, or caller-provided user IDs.
 */
async function authorize(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !secret) {
    return { failure: json(503, { error: "Staff provisioning is not configured." }) };
  }

  const header = request.headers.get("authorization") ?? "";
  if (header.length > 8192 || !/^Bearer\s+\S+$/i.test(header)) {
    return { failure: json(401, { error: "Sign in to continue." }) };
  }
  const token = header.replace(/^Bearer\s+/i, "").trim();
  try {
    const authenticated = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: "Bearer " + token } },
    });
    const verified = await authenticated.auth.getUser(token);
    const user = verified.data.user;
    if (verified.error || !user || user.is_anonymous) {
      return { failure: json(401, { error: "Your session is no longer valid." }) };
    }

    const [registry, provisioner] = await Promise.all([
      authenticated.rpc("registration_is_admin"),
      authenticated.from("fs_staff_grants")
        .select("role_code,granted_at,expires_at,revoked_at")
        .eq("user_id", user.id).eq("role_code", "platform_provisioner"),
    ]);

    if (registry.error || provisioner.error) {
      return { failure: json(503, { error: "Staff permissions could not be verified." }) };
    }
    if (registry.data !== true || !activeProvisioner(provisioner.data ?? [], Date.now())) {
      return { failure: json(403, { error: "Staff provisioning requires separate authorization." }) };
    }
    const admin = createClient(url, secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    // Re-evaluate both grants in the database before use of service_role APIs.
    const crossCheck = await admin.rpc("staff_access_authorized_v1", { p_actor: user.id });
    if (crossCheck.error || crossCheck.data !== true) {
      return { failure: json(503, { error: "Staff provisioning authorization is unavailable." }) };
    }
    return { actor: user.id, admin };
  } catch {
    return { failure: json(503, { error: "Staff permissions could not be verified." }) };
  }
}

function mutationError(message: string | undefined) {
  if (message?.includes("STAFF_ACCESS_ROLE_ALREADY_ACTIVE")) {
    return json(409, { error: "This staff member already has that active role." });
  }
  if (message?.includes("STAFF_ACCESS_ROLE_NOT_ACTIVE")) {
    return json(409, { error: "The selected role is no longer active. Refresh the directory." });
  }
  if (message?.includes("STAFF_ACCESS_LAST_REGISTRY_ADMIN")) {
    return json(409, { error: "The last active Registry Administrator cannot be revoked." });
  }
  if (message?.includes("STAFF_ACCESS_TARGET_NOT_FOUND")) {
    return json(404, { error: "The staff account no longer exists. Refresh the directory." });
  }
  return json(503, { error: "The access change could not be completed. No success has been recorded." });
}

export async function GET(request: NextRequest) {
  const gate = await authorize(request);
  if ("failure" in gate) return gate.failure;
  const { actor, admin } = gate;
  try {
    const roles = await admin.rpc("staff_access_roster_v1", { p_actor: actor });
    if (roles.error || !Array.isArray(roles.data)) {
      return json(503, { error: "The authorized staff directory is unavailable." });
    }
    const byUser = new Map<string, Array<{
      roleCode: string; active: boolean; grantedAt: string | null;
      expiresAt: string | null; revokedAt: string | null;
    }>>();
    for (const record of roles.data) {
      if (!record || typeof record.user_id !== "string") continue;
      const entry = {
        roleCode: String(record.role_code ?? ""),
        active: record.active === true,
        grantedAt: record.granted_at ?? null,
        expiresAt: record.expires_at ?? null,
        revokedAt: record.revoked_at ?? null,
      };
      byUser.set(record.user_id, [...(byUser.get(record.user_id) ?? []), entry]);
    }
    const users: Array<{
      id: string; email: string; invitedAt: string | null; confirmedAt: string | null;
      lastSignInAt: string | null; roles: typeof byUser extends Map<string, infer U> ? U : never;
    }> = [];
    for (let page = 1; page <= 21; page++) {
      // Strict upper bound prevents a silently incomplete directory.
      const result = await admin.auth.admin.listUsers({ page, perPage: 100 });
      if (result.error) return json(503, { error: "The staff directory could not be loaded." });
      const batch = result.data.users;
      if (page === 21 && batch.length > 0) {
        return json(503, { error: "The directory requires server-side pagination before use." });
      }
      for (const user of batch) {
        users.push({
          id: user.id,
          email: user.email ?? "Email not available",
          invitedAt: user.invited_at ?? null,
          confirmedAt: user.email_confirmed_at ?? null,
          lastSignInAt: user.last_sign_in_at ?? null,
          roles: byUser.get(user.id) ?? [],
        });
      }
      if (batch.length < 100) break;
    }
    return json(200, {
      users, currentUserId: actor,
      mutationsEnabled: process.env.STAFF_ACCESS_MUTATIONS_ENABLED === "true",
    });
  } catch {
    return json(503, { error: "The staff directory could not be loaded." });
  }
}

export async function POST(request: NextRequest) {
  if (process.env.STAFF_ACCESS_MUTATIONS_ENABLED !== "true") {
    return json(403, { error: "Staff access changes are disabled pending release approval." });
  }
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return json(403, { error: "Request origin could not be verified." });
  }
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > 4096 || request.headers.get("content-type")?.split(";")[0] !== "application/json") {
    return json(400, { error: "Invalid staff access request." });
  }
  const gate = await authorize(request);
  if ("failure" in gate) return gate.failure;
  let payload: StaffRequest;
  try {
    payload = await request.json() as StaffRequest;
  } catch {
    return json(400, { error: "Invalid JSON request." });
  }
  if (!payload || typeof payload !== "object" ||
      !roleCode(payload.role) || !safeReason(payload.reason) ||
      !["invite", "grant", "revoke"].includes(String(payload.action))) {
    return json(400, { error: "Select a valid role and provide an approval reason (12–500 characters)." });
  }

  const { actor, admin } = gate;
  const action = payload.action as Action;
  const role = payload.role;
  const reason = payload.reason.trim();
  let targetId: string;
  if (action === "invite") {
    if (!validEmail(payload.email)) return json(400, { error: "Enter a valid staff email address." });
    // Invitation and grant are not distributed-transaction atomic. If the
    // grant fails, this user remains unassigned (fail closed), not an admin.
    const invited = await admin.auth.admin.inviteUserByEmail(payload.email.trim().toLowerCase(), {
      redirectTo: "https://www.cowl-dok.online/admin/accept-invite",
    });
    if (invited.error || !invited.data.user?.id) {
      return json(409, { error: "This account could not be invited. Check if it already exists or retry later." });
    }
    targetId = invited.data.user.id;
  } else {
    if (!validUuid(payload.userId)) return json(400, { error: "Select an existing staff account." });
    targetId = payload.userId;
    if (actor === targetId) return json(409, { error: "You cannot change your own access." });
    const existing = await admin.auth.admin.getUserById(targetId);
    if (existing.error || !existing.data.user) return json(404, { error: "The selected staff account was not found." });
  }

  const result = await admin.rpc("staff_access_change_v1", {
    p_actor: actor, p_target: targetId,
    p_action: action === "revoke" ? "revoke" : "grant",
    p_role: role, p_reason: reason,
  });
  if (result.error || result.data !== true) {
    if (action === "invite") {
      return json(503, {
        error: "The account was invited, but the role was NOT assigned. Do not send a second invitation; refresh the directory and assign the role after resolving the error.",
        partial: true,
      });
    }
    return mutationError(result.error?.message);
  }
  return json(action === "invite" ? 202 : 200, {
    message: action === "invite"
      ? "Invitation requested and role assigned. Email delivery and acceptance still require verification."
      : action === "grant"
        ? "Role granted. Access will be checked again at the next request."
        : "Role revoked. New access checks will deny this permission; existing sessions should also be terminated.",
  });
}
