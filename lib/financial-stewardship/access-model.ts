/**
 * Trusted Financial Stewardship access model — UI and route authorization.
 *
 * Role grants originate only from the live public.fs_staff_grants table,
 * never from client user_metadata, email addresses, or a caller-supplied role.
 * All financial operations are still disabled in this phase.
 */
export const FINANCIAL_ROLE_CODES = [
  "cowl_registry_reviewer",
  "cowl_finance_verifier",
  "cowl_receipt_issuer",
  "cowl_remittance_preparer",
  "curia_receipt_custodian",
  "curia_treasury_reviewer",
  "platform_provisioner",
] as const;
export type FinancialRoleCode = typeof FINANCIAL_ROLE_CODES[number];
export type FinanceWorkspace = "cowl" | "curia";
export type FinanceSection = "inventory" | "collections" | "remittances";
export type FinanceAccess = Record<FinanceWorkspace, FinanceSection[]>;

const ROLE_SECTIONS: Record<FinancialRoleCode, readonly (readonly [FinanceWorkspace, FinanceSection])[]> = {
  cowl_registry_reviewer: [],
  cowl_finance_verifier: [["cowl", "collections"]],
  cowl_receipt_issuer: [["cowl", "inventory"], ["cowl", "collections"]],
  cowl_remittance_preparer: [["cowl", "collections"], ["cowl", "remittances"]],
  curia_receipt_custodian: [["curia", "inventory"], ["curia", "remittances"]],
  curia_treasury_reviewer: [["curia", "remittances"]],
  // A technical provisioner is never automatically an issuer or treasury reviewer.
  platform_provisioner: [],
};

const TITLES: Record<FinancialRoleCode, string> = {
  cowl_registry_reviewer: "COWL Registry Reviewer",
  cowl_finance_verifier: "COWL Finance Verifier",
  cowl_receipt_issuer: "COWL Receipt Issuer",
  cowl_remittance_preparer: "COWL Remittance Preparer",
  curia_receipt_custodian: "Curia Receipt Custodian",
  curia_treasury_reviewer: "Curia Treasury Reviewer",
  platform_provisioner: "Platform Provisioner",
};

const PATHS: Record<FinanceWorkspace, Record<FinanceSection, string>> = {
  cowl: {
    inventory: "/financial-stewardship",
    collections: "/financial-stewardship/collections",
    remittances: "/financial-stewardship/remittances",
  },
  curia: {
    inventory: "/curia",
    collections: "/curia/collections",
    remittances: "/curia/remittances",
  },
};

export function isFinancialRoleCode(role: unknown): role is FinancialRoleCode {
  return typeof role === "string" && (FINANCIAL_ROLE_CODES as readonly string[]).includes(role);
}


/** Grant lifecycle is evaluated against the server clock, never client input.
 * Revoked, future-dated, expired or malformed grants fail closed.
 */
export type FinanceGrant = {
  role_code: string;
  granted_at: string;
  expires_at: string | null;
  revoked_at: string | null;
};

export function activeFinancialRoles(grants: readonly FinanceGrant[], nowMs: number): FinancialRoleCode[] {
  if (!Number.isFinite(nowMs)) return [];
  const roles = new Set<FinancialRoleCode>();
  for (const grant of grants) {
    if (!isFinancialRoleCode(grant.role_code) || grant.revoked_at) continue;
    const startMs = Date.parse(grant.granted_at);
    const endMs = grant.expires_at ? Date.parse(grant.expires_at) : Infinity;
    if (!Number.isFinite(startMs) || Number.isNaN(endMs) || startMs > nowMs || endMs <= nowMs) continue;
    roles.add(grant.role_code);
  }
  return Array.from(roles);
}

export function calculateFinanceAccess(roleCodes: readonly string[]): FinanceAccess {
  const access: FinanceAccess = { cowl: [], curia: [] };
  for (const role of Array.from(new Set(roleCodes))) {
    if (!isFinancialRoleCode(role)) continue;
    for (const [workspace, section] of ROLE_SECTIONS[role]) {
      if (!access[workspace].includes(section)) access[workspace].push(section);
    }
  }
  const order: FinanceSection[] = ["inventory", "collections", "remittances"];
  for (const workspace of ["cowl", "curia"] as const) {
    access[workspace].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  }
  return access;
}

export function financePath(workspace: FinanceWorkspace, section: FinanceSection): string {
  return PATHS[workspace][section];
}

export function financeHome(access: FinanceAccess): string | null {
  const workspace: FinanceWorkspace | null = access.cowl.length ? "cowl" : access.curia.length ? "curia" : null;
  return workspace ? financePath(workspace, access[workspace][0]) : null;
}

export function financeRolesLabel(roleCodes: readonly string[], workspace: FinanceWorkspace): string {
  const roles = Array.from(new Set(roleCodes)).filter(isFinancialRoleCode).filter(role =>
    ROLE_SECTIONS[role].some(([w]) => w === workspace)
  );
  return roles.map(role => TITLES[role]).join(" · ") || "Unassigned";
}

export function isFinanceSection(value: string | null): value is FinanceSection {
  return value === "inventory" || value === "collections" || value === "remittances";
}
export function isFinanceWorkspace(value: string | null): value is FinanceWorkspace {
  return value === "cowl" || value === "curia";
}
