"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  ExternalLink, LayoutDashboard, Loader2, LogOut,
  ScrollText, Settings, ShieldCheck, Upload, Users,
  FileBadge, UserPlus, ClipboardList, Wallet, Landmark,
} from "lucide-react";
import PortalShell, { type PortalNavGroup } from "@/components/portal-shell";

const NAV_GROUPS = [
  { name: "Overview", items: [{ href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard }] },
  { name: "Registry", items: [
    { href: "/admin/members", label: "Members", icon: Users },
    { href: "/admin/members/add", label: "Add Member", icon: UserPlus },
    { href: "/admin/verify", label: "Quick-Scan Matrix", icon: ShieldCheck },
    { href: "/admin/import", label: "Bulk Registration Import", icon: Upload },
    { href: "/admin/duplicate-review-preview", label: "Duplicate Queue Preview", icon: ClipboardList },
    { href: "/admin/renewal-batches", label: "Renewal Batches", icon: ClipboardList },
    { href: "/admin/renewal-reviews", label: "Renewal Review Queue", icon: ShieldCheck },
  ] },
  { name: "Financial Stewardship", items: [
    { href: "/admin/financial-stewardship-preview", label: "Financial Stewardship (Demo)", icon: Wallet },
    { href: "/curia", label: "Curia Portal (Demo)", icon: Landmark },
  ] },
  { name: "Documents", items: [{ href: "/admin/certificates", label: "Certificate Templates", icon: FileBadge }] },
  { name: "Governance", items: [
    { href: "/admin/audit", label: "Audit Trail", icon: ScrollText },
    { href: "/admin/site-settings", label: "Public Website Settings", icon: Settings },
  ] },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [freshDisplayName, setFreshDisplayName] = useState<string | null>(null);
  const isLoginPage = ["/admin", "/admin/forgot-password", "/admin/reset-link-sent", "/admin/reset-password"].includes(pathname);

  useEffect(() => {
    if (!loading && !user && !isLoginPage) router.replace("/admin");
  }, [loading, user, isLoginPage, router]);

  // Fetch fresh Auth metadata: the auth context initially reads cached session data.
  useEffect(() => {
    if (!user?.id || isLoginPage) return;
    let cancelled = false;
    setFreshDisplayName(null);

    void getSupabaseBrowserClient().auth.getUser().then(({ data, error }) => {
      if (cancelled || error || !data.user || data.user.id !== user.id) return;
      const name = data.user.user_metadata?.display_name;
      setFreshDisplayName(typeof name === "string" && name.trim() ? name.trim() : null);
    });

    return () => { cancelled = true; };
  }, [user?.id, isLoginPage]);

  if (isLoginPage) return <>{children}</>;
  if (loading) return (
    <div className="flex min-h-screen items-center justify-center bg-[#FBF9F9]" role="status">
      <Loader2 className="h-6 w-6 animate-spin text-[#890022]" aria-hidden="true" />
      <span className="sr-only">Loading administration</span>
    </div>
  );
  if (!user) return null;

  const metadataName = user.user_metadata?.display_name;
  const displayName = freshDisplayName || (
    typeof metadataName === "string" && metadataName.trim()
      ? metadataName.trim()
      : user.email ?? "Administrator"
  );
  const isActive = (href: string) => pathname === href || (href === "/admin/members" && pathname?.startsWith("/admin/members/") && pathname !== "/admin/members/add");
  const handleSignOut = async () => { await signOut(); router.replace("/admin"); };

  const groups: PortalNavGroup[] = NAV_GROUPS.map(group => ({
    name: group.name,
    items: group.items.map(item => ({
      id: item.href,
      href: item.href,
      label: item.label,
      icon: item.icon,
      active: isActive(item.href),
    })),
  }));
  groups.push({
    items: [{
      id: "public-website", href: "/", label: "Public Website", external: true,
      icon: ExternalLink,
    }],
  });

  return <PortalShell
    title="Admin Portal"
    subtitle="Liturgical Ministry Registry"
    homeHref="/admin/dashboard"
    navigationLabel="Admin navigation"
    groups={groups}
    footer={<>
      <p className="truncate text-sm font-semibold text-white" title={displayName}>{displayName}</p>
      <p className="mt-1 text-sm text-white/75">Administrator</p>
      <button type="button" onClick={handleSignOut}
        className="mt-3 inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-white hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
        <LogOut className="h-4 w-4" aria-hidden="true" /> Sign Out
      </button>
    </>}
    compactFooter={<button type="button" onClick={handleSignOut} title="Sign Out"
      aria-label="Sign Out" className="grid h-11 w-11 place-items-center rounded-sm text-white hover:bg-white/15">
      <LogOut className="h-[18px] w-[18px]" aria-hidden="true" />
    </button>}
  >
    <main id="admin-content" className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8 xl:px-10">
      {children}
    </main>
  </PortalShell>;
}
