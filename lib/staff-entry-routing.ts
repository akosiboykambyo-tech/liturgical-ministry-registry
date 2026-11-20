/**
 * Shared post-login destination policy.
 * This controls navigation only. It does not authorize API, Registry, or
 * financial access: those decisions remain server-side/RLS-guarded.
 */
export type RegistryStaffCheck = "granted" | "denied" | "unavailable";
export type FinanceStaffCheck = {
  status: number;
  home?: string | null;
  access?: { cowl?: string[]; curia?: string[] };
};

const ALLOWED_FINANCE_HOMES = new Set([
  "/financial-stewardship",
  "/financial-stewardship/collections",
  "/financial-stewardship/remittances",
  "/curia",
  "/curia/remittances",
]);

const UNAVAILABLE = "/admin/access-pending?verification=unavailable";

/**
 * A Registry lookup outage must not elevate a user to Registry Admin.
 * A finance-only user with independent, current server-approved grants
 * may still reach their finance workspace.
 */
export function staffLandingRoute(
  registry: RegistryStaffCheck,
  finance: FinanceStaffCheck,
): string {
  if (registry === "granted") return "/admin/dashboard";

  const cowl = finance.access?.cowl;
  const curia = finance.access?.curia;
  const hasCowl = Array.isArray(cowl) && cowl.length > 0;
  const hasCuria = Array.isArray(curia) && curia.length > 0;
  const home = finance.home;
  const validHome = typeof home === "string" && ALLOWED_FINANCE_HOMES.has(home)
    && (home.startsWith("/curia") ? hasCuria : hasCowl);

  if (finance.status >= 200 && finance.status < 300 && validHome) {
    return hasCowl && hasCuria ? "/financial-stewardship/workspaces" : home;
  }

  // An authorized session without Registry or Finance grants is a 403,
  // but a Registry verification outage is *not* evidence of no Registry role.
  return registry === "denied" && finance.status === 403
    ? "/admin/access-pending"
    : UNAVAILABLE;
}
