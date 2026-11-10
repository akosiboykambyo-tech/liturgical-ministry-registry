"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

export const FINANCIAL_STAGING_URL = "https://rtptybxugjhvpfjvcvgw.supabase.co";

export const WORKSPACES = {
  cowl: { label: "COWL Financial Stewardship", path: "/admin/financial-stewardship" },
  curia: { label: "Curia Portal", path: "/curia" },
} as const;

export type FinancialWorkspace = keyof typeof WORKSPACES;

const COWL_ROLES = new Set([
  "cowl_receipt_issuer",
  "cowl_financial_workspace_viewer",
  "cowl_finance_verifier",
  "cowl_remittance_preparer",
]);

const CURIA_ROLES = new Set([
  "curia_receipt_custodian",
  "curia_financial_workspace_viewer",
  "curia_treasury_reviewer",
]);

export function workspacesForRoles(roles: readonly string[]): FinancialWorkspace[] {
  const found: FinancialWorkspace[] = [];
  if (roles.some(role => COWL_ROLES.has(role))) found.push("cowl");
  if (roles.some(role => CURIA_ROLES.has(role))) found.push("curia");
  return found;
}

/** This is UX routing only. Each protected financial RPC performs its own
 * server-side role check; clients cannot grant themselves access.
 */
export async function getStagingWorkspaces(client: SupabaseClient, userId: string) {
  const { data, error } = await client
    .from("fs_staff_grants")
    .select("role_code,revoked_at,expires_at")
    .eq("user_id", userId);
  if (error) throw new Error("Role permissions could not be verified. Please try again.");
  const now = Date.now();
  const roles = (data || [])
    .filter(grant => !grant.revoked_at
      && (!grant.expires_at || Date.parse(grant.expires_at) > now))
    .map(grant => grant.role_code as string);
  return workspacesForRoles(roles);
}
