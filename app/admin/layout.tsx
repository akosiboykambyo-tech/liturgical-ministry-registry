"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileBadge,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  Users,
  Wallet,
  X,
} from "@/components/phosphor-icons";
import { useAuth } from "@/lib/auth-context";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { staffLandingRoute, type RegistryStaffCheck } from "@/lib/staff-entry-routing";
import { CenteredAdminLoader } from "@/components/admin-centered-loader";
import { AdminAccessNotice, adminAccessPrimaryAction } from "@/components/admin-access-notice";
import { cn } from "@/lib/utils";
import { ebGaramond, inter } from "@/app/fonts";

const NAV_ITEMS = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/verification", label: "MEMBER MANAGEMENT", icon: ShieldCheck },
  { href: "/admin/members", label: "RECORD MANAGEMENT", icon: Users },
  { href: "/admin/certificates", label: "CERTIFICATE MANAGEMENT", icon: FileBadge },
  { href: "/admin/administration", label: "SYSTEM MANAGEMENT", icon: Settings },
  { href: "/financial-stewardship", label: "FINANCIAL STEWARDSHIP", icon: Wallet },
];

const LOGIN_ROUTES = [
  "/admin",
  "/admin/forgot-password",
  "/admin/reset-link-sent",
  "/admin/reset-password",
  "/admin/accept-invite",
  "/admin/access-pending",
];

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

function isActiveRoute(pathname: string | null, href: string): boolean {
  if (pathname === href) return true;

  if (href === "/admin/members") {
    return pathname?.startsWith("/admin/members/") ?? false;
  }
  if (href === "/admin/verification") {
    return [
      "/admin/verify",
      "/admin/import",
      "/admin/renewal-batches",
      "/admin/renewal-reviews",
      "/admin/duplicate-review-preview",
    ].some((route) => pathname === route || pathname?.startsWith(route + "/"));
  }
  if (href === "/admin/administration") {
    return pathname === "/admin/audit" || pathname === "/admin/site-settings" || pathname === "/admin/staff-access";
  }
  return false;
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, session, loading, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [hoverOpen, setHoverOpen] = useState(false);
  const [focusOpen, setFocusOpen] = useState(false);
  const [pinnedOpen, setPinnedOpen] = useState(false);
  const [freshDisplayName, setFreshDisplayName] = useState<string | null>(null);
  const [registryAccess, setRegistryAccess] = useState<"checking" | "granted" | "unavailable">("checking");
  const [financeEntry, setFinanceEntry] = useState<string | null>(null);

  const isLoginPage = LOGIN_ROUTES.includes(pathname ?? "");
  const desktopExpanded = hoverOpen || focusOpen || pinnedOpen;

  useEffect(() => {
    if (!loading && !user && !isLoginPage) router.replace("/admin");
  }, [loading, user, isLoginPage, router]);

  useEffect(() => {
    if (isLoginPage || loading || !user || !session?.access_token) return;
    let cancelled = false;
    const token = session.access_token;
    setRegistryAccess("checking");
    setFinanceEntry(null);
    void (async () => {
      try {
        const registry = await getSupabaseBrowserClient().rpc("registration_is_admin");
        if (cancelled) return;
        const registryCheck: RegistryStaffCheck =
          registry.error ? "unavailable" : registry.data === true ? "granted" : "denied";
        const financeRequest = fetch("/api/financial-stewardship/access?workspace=all", {
          headers: { Authorization: "Bearer " + token }, cache: "no-store",
        });
        if (registryCheck !== "granted") {
          const result = await financeRequest;
          const data = await result.json() as { home?: string | null; access?: { cowl: string[]; curia: string[] } };
          if (cancelled) return;
          const destination = staffLandingRoute(registryCheck, {
            status: result.status, home: data.home, access: data.access,
          });
          // Never render Registry content when its independent check fails.
          if (destination === "/admin/access-pending?verification=unavailable") {
            setRegistryAccess("unavailable");
          } else {
            router.replace(destination);
          }
          return;
        }
        setRegistryAccess("granted");
        // Finance link discovery must NEVER block an authorized Registry Admin.
        // A failed finance service only hides the optional financial link.
        try {
          const result = await financeRequest;
          if (!cancelled && result.ok) {
            const data = await result.json() as { home?: string | null };
            setFinanceEntry(data.home ?? null);
          }
        } catch {
          if (!cancelled) setFinanceEntry(null);
        }
      } catch {
        if (!cancelled) setRegistryAccess("unavailable");
      }
    })();
    return () => { cancelled = true; };
  }, [loading, user?.id, session?.access_token, isLoginPage, router]);

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

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
      if (event.key !== "Tab") return;
      const sidebar = document.getElementById("admin-mobile-sidebar");
      if (!sidebar) return;
      const focusable = Array.from(
        sidebar.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    document.getElementById("admin-mobile-close")?.focus();

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileOpen]);

  if (isLoginPage) return <>{children}</>;
  if (loading || (user && registryAccess === "checking")) return <CenteredAdminLoader fullscreen label="Checking Registry authorization…" />;
  if (!user) return null;
  if (registryAccess === "unavailable") return (
    <AdminAccessNotice
      title="Access verification unavailable"
      description="We could not verify your registry permissions at this time. No administrative pages have been opened."
      actions={
        <button
          type="button"
          onClick={() => window.location.reload()}
          className={adminAccessPrimaryAction}
        >
          Retry verification
        </button>
      }
    >
      <p className="mt-3 text-sm leading-6 text-[#5F4A4F]">
        Please try again. If this continues, contact the designated administrator.
      </p>
    </AdminAccessNotice>
  );

  const rawName = user.user_metadata?.display_name;
  const displayName = freshDisplayName ||
    (typeof rawName === "string" && rawName.trim() ? rawName.trim() : user.email ?? "Administrator");

  const handleSignOut = async () => {
    await signOut();
    router.replace("/admin");
  };

  const renderNavigation = (expanded: boolean, mobile = false) => (
    <>
      <nav aria-label={mobile ? "Mobile admin navigation" : "Admin navigation"} className="min-h-0 flex-1 space-y-1 overflow-y-auto overflow-x-hidden px-2.5 py-5">
        {NAV_ITEMS.filter(item => item.href !== "/financial-stewardship" || financeEntry).map((item) => {
          const Icon = item.icon;
          const active = isActiveRoute(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href === "/financial-stewardship" ? (financeEntry ?? item.href) : item.href}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              title={!expanded ? item.label : undefined}
              onClick={() => { if (mobile) setMobileOpen(false); }}
              className={cn(
                "flex min-h-12 items-center py-2.5 text-sm font-medium transition-colors",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white",
                expanded ? "gap-3 border-l-[3px] px-3" : "justify-center gap-0 border-l-0 px-0",
                active
                  ? "rounded-none border-white bg-white text-[#890022]"
                  : "rounded-md border-transparent text-white/90 hover:bg-white/15 hover:text-white"
              )}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
              <span
                aria-hidden={!expanded}
                className={cn(
                  "block min-w-0 whitespace-nowrap transition-[opacity,max-width] duration-200 motion-reduce:transition-none",
                  expanded ? "max-w-[180px] opacity-100" : "max-w-0 overflow-hidden opacity-0"
                )}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
        <div className="mt-5 border-t border-white/20 pt-4">
          <Link
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            title={!expanded ? "Public Website" : undefined}
            aria-label="Public Website (opens in new tab)"
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-md px-3 text-sm text-white/85 hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white",
              !expanded && "justify-center px-0"
            )}
          >
            <ExternalLink className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
            <span aria-hidden={!expanded} className={cn("whitespace-nowrap transition-opacity duration-200", expanded ? "opacity-100" : "sr-only")}>
              Public Website
            </span>
          </Link>
        </div>
      </nav>

      <footer className="shrink-0 border-t border-white/25 px-3 py-3">
        {expanded && (
          <div className="mb-2 px-2">
            <p className="truncate text-sm font-semibold text-white" title={displayName}>{displayName}</p>
            <p className="mt-0.5 text-xs text-white/75">Administrator</p>
          </div>
        )}
        <button
          type="button"
          onClick={handleSignOut}
          title={!expanded ? "Sign Out" : undefined}
          aria-label="Sign Out"
          className={cn(
            "flex min-h-11 w-full items-center gap-3 rounded-md px-2.5 text-sm font-semibold text-white/90 hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white",
            !expanded && "justify-center"
          )}
        >
          <LogOut className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
          {expanded && <span>Sign Out</span>}
        </button>
      </footer>
    </>
  );

  return (
    <div className={cn(inter.className, "min-h-[100dvh] bg-[#FBF9F9] text-[#1E1114]")}>
      {/* On small screens, preserve a labeled drawer instead of an icon-only rail. */}
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[#E6DADC] bg-white px-4 lg:hidden">
        <Link href="/admin/dashboard" className="flex items-center gap-2.5 text-sm font-semibold text-[#5A1730]">
          <DiocesanCoat size={40} />
          <span>Admin Portal</span>
        </Link>
        <button
          type="button"
          aria-controls="admin-mobile-sidebar"
          aria-expanded={mobileOpen}
          aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
          onClick={() => setMobileOpen((open) => !open)}
          className="grid h-11 w-11 place-items-center rounded-md border border-[#E6DADC] text-[#890022] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#890022]"
        >
          {mobileOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
        </button>
      </header>

      <div className="flex min-h-[100dvh] items-stretch">
        {/* Aceternity sidebar-demo interaction: compact desktop icon rail
            expands on hover, keyboard focus, or explicit pin. No Tabler or
            motion dependency is needed; all icons come from Lucide. */}
        <aside
          id="admin-desktop-sidebar"
          aria-label="Desktop admin sidebar"
          onMouseEnter={() => setHoverOpen(true)}
          onMouseLeave={() => setHoverOpen(false)}
          onFocusCapture={() => setFocusOpen(true)}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusOpen(false);
          }}
          className={cn(
            "sticky top-0 hidden h-[100dvh] shrink-0 flex-col overflow-hidden bg-[#890022] text-white shadow-[2px_0_16px_rgba(67,12,28,0.10)]",
            "transition-[width] duration-300 ease-in-out motion-reduce:transition-none lg:flex",
            desktopExpanded ? "w-[270px]" : "w-[76px]"
          )}
        >
          <div className={cn(
            "flex min-h-[96px] shrink-0 items-center border-b border-white/20",
            desktopExpanded ? "gap-3 px-4" : "justify-center px-2"
          )}>
            <DiocesanCoat size={54} />
            <div className={cn(
              "min-w-0 overflow-hidden whitespace-nowrap transition-[opacity,max-width] duration-200 motion-reduce:transition-none",
              desktopExpanded ? "max-w-[160px] opacity-100" : "max-w-0 opacity-0"
            )}>
              <p className={cn(ebGaramond.className, "text-[22px] font-medium leading-none")}>Admin Portal</p>
              <p className="mt-1 text-[12px] text-white/80">Liturgical Ministry Registry</p>
            </div>
          </div>

          <div className={cn("flex shrink-0 items-center py-2", desktopExpanded ? "justify-end px-3" : "justify-center")}>
            <button
              type="button"
              onClick={() => setPinnedOpen((current) => !current)}
              aria-label={pinnedOpen ? "Unpin sidebar" : "Pin sidebar open"}
              aria-pressed={pinnedOpen}
              title={pinnedOpen ? "Unpin sidebar" : "Pin sidebar open"}
              className="grid h-9 w-9 place-items-center rounded-md text-white/85 hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            >
              {desktopExpanded ? <ChevronLeft className="h-4 w-4" aria-hidden="true" /> : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
            </button>
          </div>
          {renderNavigation(desktopExpanded)}
        </aside>

        <main id="admin-content" className="mx-auto w-full min-w-0 max-w-[1600px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8 xl:px-10">
          {children}
        </main>
      </div>

      {mobileOpen && (
        <>
          <button
            type="button"
            aria-label="Close navigation overlay"
            onClick={() => setMobileOpen(false)}
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          />
          <aside
            id="admin-mobile-sidebar"
            aria-label="Mobile admin sidebar"
            role="dialog"
            aria-modal="true"
            className="fixed inset-y-0 left-0 z-50 flex w-[min(86vw,320px)] flex-col bg-[#890022] text-white shadow-2xl lg:hidden"
          >
            <div className="flex min-h-[90px] items-center gap-3 border-b border-white/20 px-4">
              <DiocesanCoat size={48} />
              <div className="min-w-0 flex-1">
                <p className={cn(ebGaramond.className, "text-[22px]")}>Admin Portal</p>
                <p className="text-xs text-white/80">Liturgical Ministry Registry</p>
              </div>
              <button
                id="admin-mobile-close"
                type="button"
                aria-label="Close navigation"
                onClick={() => setMobileOpen(false)}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-md hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            {renderNavigation(true, true)}
          </aside>
        </>
      )}
    </div>
  );
}
