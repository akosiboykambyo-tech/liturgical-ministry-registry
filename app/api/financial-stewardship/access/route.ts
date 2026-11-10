import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import {
  calculateFinanceAccess, financeHome, financePath, isFinanceSection,
  isFinanceWorkspace, type FinancialRoleCode,
} from "@/lib/financial-stewardship/access-model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "Vary": "Authorization",
  "X-Content-Type-Options": "nosniff",
};

const respond = (status: number, data: Record<string, unknown>) =>
  NextResponse.json(data, { status, headers: HEADERS });

/**
 * A live read-time authorization check, not a writable financial API.
 * Query uses the verified Supabase identity AND that user's JWT-scoped RLS.
 * No service-role key or request-provided user id is used.
 */
export async function GET(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !publishable) return respond(503, { error: "Financial authorization is unavailable." });

  const header = request.headers.get("authorization") ?? "";
  if (!/^Bearer\s+\S+$/i.test(header) || header.length > 8192) {
    return respond(401, { error: "A current signed-in session is required." });
  }
  const token = header.replace(/^Bearer\s+/i, "").trim();
  const workspace = request.nextUrl.searchParams.get("workspace");
  const section = request.nextUrl.searchParams.get("section");

  if (workspace !== "all" && !isFinanceWorkspace(workspace)) {
    return respond(400, { error: "Invalid workspace." });
  }
  if (workspace !== "all" && !isFinanceSection(section)) {
    return respond(400, { error: "Invalid financial section." });
  }

  try {
    const supabase = createClient(url, publishable, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: "Bearer " + token } },
    });
    const verified = await supabase.auth.getUser(token);
    if (verified.error || !verified.data.user || verified.data.user.is_anonymous) {
      return respond(401, { error: "A verified signed-in session is required." });
    }

    const result = await supabase.from("fs_staff_grants")
      .select("role_code,granted_at,expires_at,revoked_at")
      .eq("user_id", verified.data.user.id)
      .is("revoked_at", null);

    // This covers missing migrations, missing grants, unavailable DB and RLS errors.
    // Never fall back to a registry admin or any finance role on lookup failure.
    if (result.error) {
      console.error("Financial role read failed:", result.error.code);
      return respond(503, { error: "Financial role verification is temporarily unavailable." });
    }

    const adminCheck = await supabase.rpc("registration_is_admin");
    // This optional flag affects a navigation link, never financial permission.
    const registryAdmin = !adminCheck.error && adminCheck.data === true;
    const now = Date.now();
    const roles: FinancialRoleCode[] = (result.data ?? [])
      .filter(row => !row.revoked_at && (!row.expires_at || Date.parse(row.expires_at) > now))
      .map(row => row.role_code as FinancialRoleCode);
    const access = calculateFinanceAccess(roles);
    const home = financeHome(access);

    if (!home) {
      return respond(403, {
        error: "Financial Stewardship access has not been approved for this account.",
        access, home: null,
      });
    }

    if (workspace !== "all" && isFinanceWorkspace(workspace) &&
        isFinanceSection(section) && !access[workspace].includes(section)) {
      const firstInScope = access[workspace][0];
      return respond(403, {
        error: "Your approved financial role does not permit this section.",
        access, home: firstInScope ? financePath(workspace, firstInScope) : home,
      });
    }

    return respond(200, { roles, access, home, registryAdmin, checkedAt: new Date(now).toISOString() });
  } catch {
    return respond(503, { error: "Financial role verification is temporarily unavailable." });
  }
}