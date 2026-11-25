"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

export const FINANCIAL_STAGING_URL = "https://rtptybxugjhvpfjvcvgw.supabase.co";

export const WORKSPACES = {
  cowl: { label: "COWL Financial Stewardship", path: "/demo/finance/cowl" },
  curia: { label: "Curia Portal", path: "/demo/finance/curia" },
  renewals: {label:"Renewal Processing Desk",path:"/demo/finance/renewals"},
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
    .select("role_code,granted_at,revoked_at,expires_at")
    .eq("user_id", userId);
  if (error) throw new Error("Role permissions could not be verified. Please try again.");
  const now = Date.now();
  const roles = (data || [])
    .filter(grant => !grant.revoked_at && Number.isFinite(Date.parse(grant.granted_at)) && Date.parse(grant.granted_at) <= now
      && (!grant.expires_at || Date.parse(grant.expires_at) > now))
    .map(grant => grant.role_code as string);
  const workspaces=workspacesForRoles(roles);
  if(process.env.NEXT_PUBLIC_RENEWAL_DEMO==="enabled") {
    const {data:access,error:accessError}=await client.rpc("rc3_demo_access");
    if(accessError)throw new Error("Renewal access could not be verified.");
    if(access?.admin===true||access?.finance===true)workspaces.push("renewals");
  }
  return workspaces;
}
