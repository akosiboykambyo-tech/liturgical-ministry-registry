"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  ExternalLink, LayoutDashboard, Loader2, LogOut,
  Menu, ScrollText, Settings, ShieldCheck, Upload, Users, X,
  FileBadge, UserPlus, ClipboardList,
} from "lucide-react";
import { ebGaramond, inter } from "@/app/fonts";

const NAV_GROUPS = [
  { name: "Overview", items: [{ href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard }] },
  { name: "Registry", items: [
    { href: "/admin/members", label: "Members", icon: Users },
    { href: "/admin/members/add", label: "Add Member", icon: UserPlus },
    { href: "/admin/verify", label: "Quick-Scan Matrix", icon: ShieldCheck },
    { href: "/admin/import", label: "Bulk Registration Import", icon: Upload },
    { href: "/admin/renewal-batches", label: "Renewal Batches", icon: ClipboardList },
    { href: "/admin/renewal-reviews", label: "Renewal Review Queue", icon: ShieldCheck },
  ] },
  { name: "Documents", items: [{ href: "/admin/certificates", label: "Certificate Templates", icon: FileBadge }] },
  { name: "Governance", items: [
    { href: "/admin/audit", label: "Audit Trail", icon: ScrollText },
    { href: "/admin/site-settings", label: "Public Website Settings", icon: Settings },
  ] },
];

// The commission's wide identity SVG includes the diocesan coat of arms
// centered above the lettering. Show that crest alone in the compact sidebar.
function DiocesanCoat({ size = 48 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="705 0 277 230"
      role="img"
      aria-label="Coat of arms of the Roman Catholic Diocese of Kalookan"
      className="shrink-0 overflow-hidden"
    >
      <image href="/images/Asset_1.svg" x="0" y="0" width="1686.95" height="444.5" />
    </svg>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
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

  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  useEffect(() => {
    if (!sidebarOpen) return;
    const onEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setSidebarOpen(false); };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [sidebarOpen]);

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

  return (
    <div className={`${inter.className} min-h-screen bg-[#FBF9F9] text-[#1E1114]`}>
      <div className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[#E6DADC] bg-white px-4 lg:hidden">
        <Link href="/admin/dashboard" className="flex items-center gap-2 text-sm font-semibold">
          <DiocesanCoat size={40} />
          <span>Admin Portal</span>
        </Link>
        <button type="button" aria-label={sidebarOpen ? "Close navigation" : "Open navigation"} aria-expanded={sidebarOpen} aria-controls="admin-sidebar" onClick={() => setSidebarOpen(!sidebarOpen)} className="grid h-11 w-11 place-items-center border border-[#E6DADC] text-[#890022]">
          {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      <div className="flex min-h-screen">
        {sidebarOpen && <button type="button" className="fixed inset-0 z-40 bg-black/50 lg:hidden" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
        <aside id="admin-sidebar" className={`fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col bg-[#890022] text-white transition-transform duration-200 lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:shrink-0 lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
          <div className="flex min-h-[92px] items-center gap-3 border-b border-white/20 px-5 py-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center">
              <DiocesanCoat size={54} />
            </div>
            <div className="min-w-0">
              <div className={`${ebGaramond.className} text-[23px] font-medium leading-none`}>Admin Portal</div>
              <div className="mt-1 text-[14px] leading-4 text-white/80">Liturgical Ministry Registry</div>
            </div>
          </div>

          <nav aria-label="Admin navigation" className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 py-6">
            {NAV_GROUPS.map(group => (
              <div key={group.name}>
                <p className="px-3 pb-2 text-[14px] font-semibold uppercase tracking-[0.12em] text-white/75">{group.name}</p>
                <div className="space-y-1">
                  {group.items.map(item => {
                    const Icon = item.icon;
                    const active = isActive(item.href);
                    return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} onClick={() => setSidebarOpen(false)} className={`flex min-h-10 items-center gap-3 border-l-[3px] px-3 py-2 text-[14px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white ${active ? "border-white bg-white text-[#890022]" : "border-transparent text-white/90 hover:bg-white/15 hover:text-white"}`}>
                      <Icon className="h-[16px] w-[16px] shrink-0" aria-hidden="true" />{item.label}
                    </Link>;
                  })}
                </div>
              </div>
            ))}
            <div className="px-3"><Link href="/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 py-2 text-[14px] font-medium text-white/90 underline-offset-4 hover:underline">Public Website <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></Link></div>
          </nav>
          <div className="border-t border-white/25 px-5 py-4">
            <p className="truncate text-[14px] font-semibold text-white" title={displayName}>{displayName}</p>
            <p className="mt-1 text-[14px] text-white/75">Administrator</p>
            <button type="button" onClick={handleSignOut} className="mt-3 inline-flex min-h-10 items-center gap-2 text-[14px] font-semibold text-white hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"><LogOut className="h-4 w-4" aria-hidden="true" />Sign Out</button>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <main id="admin-content" className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8 xl:px-10">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
