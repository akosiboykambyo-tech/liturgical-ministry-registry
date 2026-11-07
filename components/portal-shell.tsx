"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Menu, PanelLeftClose, PanelLeftOpen, X, type LucideIcon } from "lucide-react";
import { ebGaramond, inter } from "@/app/fonts";

export type PortalNavItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  active?: boolean;
  href?: string;
  external?: boolean;
  onSelect?: () => void;
};
export type PortalNavGroup = { name?: string; items: PortalNavItem[] };

const COLLAPSED_KEY = "cowl-dok-portal-sidebar-collapsed";

export function DiocesanCoat({ size = 48 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="705 0 277 230"
    role="img" aria-label="Coat of arms of the Roman Catholic Diocese of Kalookan"
    className="shrink-0 overflow-hidden">
    <image href="/images/Asset_1.svg" x="0" y="0" width="1686.95" height="444.5" />
  </svg>;
}

/**
 * Shared admin/Curia shell: same crest, widths, compact navigation,
 * active treatment, mobile drawer, and keyboard labels. Nav contents stay
 * separate because Curia roles and admin roles must not be conflated.
 */
export default function PortalShell({
  title, subtitle, homeHref, navigationLabel, groups, footer, compactFooter, children,
}: {
  title: string;
  subtitle: string;
  homeHref: string;
  navigationLabel: string;
  groups: PortalNavGroup[];
  footer: ReactNode;
  compactFooter: ReactNode;
  children: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  useEffect(() => {
    try { setCollapsed(localStorage.getItem(COLLAPSED_KEY) !== "false"); }
    catch { /* Keep expanded mode when browser storage is unavailable. */ }
  }, []);
  const toggleCollapsed = () => setCollapsed(value => {
    const next = !value;
    try { localStorage.setItem(COLLAPSED_KEY, String(next)); }
    catch { /* User preference stays in memory if storage is blocked. */ }
    return next;
  });
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  const handleSelect = (item: PortalNavItem) => {
    setMobileOpen(false);
    item.onSelect?.();
  };
  const navClass = (active?: boolean) =>
    "flex min-h-11 w-full items-center border-l-[3px] text-left text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white " +
    (collapsed ? "gap-3 px-3 lg:justify-center lg:gap-0 lg:px-1" : "gap-3 px-3") +
    (active
      ? " border-white bg-white text-[#890022]"
      : " border-transparent text-white/90 hover:bg-white/15 hover:text-white");

  return <div className={inter.className + " min-h-screen bg-[#FBF9F9] text-[#1E1114]"}>
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[#E6DADC] bg-white px-4 lg:hidden">
      <Link href={homeHref} className="flex min-w-0 items-center gap-2 text-sm font-semibold">
        <DiocesanCoat size={40} />
        <span className="truncate">{title}</span>
      </Link>
      <button type="button" aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
        aria-expanded={mobileOpen} aria-controls="portal-sidebar"
        onClick={() => setMobileOpen(open => !open)}
        className="grid h-11 w-11 shrink-0 place-items-center border border-[#E6DADC] text-[#890022]">
        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>
    </header>
    <div className="flex min-h-screen">
      {mobileOpen && <button type="button" aria-label="Close navigation" onClick={() => setMobileOpen(false)}
        className="fixed inset-0 z-40 bg-black/50 lg:hidden" />}
      <aside id="portal-sidebar" aria-label={navigationLabel}
        className={"fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col bg-[#890022] text-white transition-[transform,width] duration-200 lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:shrink-0 lg:translate-x-0 " +
          (collapsed ? "lg:w-[76px] " : "lg:w-[260px] ") +
          (mobileOpen ? "translate-x-0" : "-translate-x-full")}>
        <div className={"flex min-h-[92px] items-center border-b border-white/20 py-4 " + (collapsed ? "justify-between gap-2 px-5 lg:flex-col lg:justify-center lg:gap-1 lg:px-1" : "gap-3 px-5")}>
          <Link href={homeHref} title={title} onClick={() => setMobileOpen(false)}
            className={"flex h-14 w-14 shrink-0 items-center justify-center " + (collapsed ? "lg:h-12 lg:w-12" : "")}>
            <DiocesanCoat size={collapsed ? 44 : 54} />
          </Link>
          <div className={"min-w-0 " + (collapsed ? "lg:hidden" : "")}>
            <div className={ebGaramond.className + " text-[23px] font-medium leading-none"}>{title}</div>
            <div className="mt-1 text-[13px] leading-4 text-white/80">{subtitle}</div>
          </div>
          <button type="button" title={collapsed ? "Expand navigation" : "Collapse navigation"}
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"} aria-expanded={!collapsed}
            onClick={toggleCollapsed}
            className={"hidden h-9 w-9 shrink-0 place-items-center rounded-sm border border-white/20 text-white/90 hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white lg:grid " +
              (collapsed ? "lg:h-8 lg:w-11" : "ml-auto")}>
            {collapsed ? <PanelLeftOpen className="h-[18px] w-[18px]" /> : <PanelLeftClose className="h-[18px] w-[18px]" />}
          </button>
        </div>
        <nav aria-label={navigationLabel} className={"min-h-0 flex-1 space-y-5 overflow-y-auto py-6 " + (collapsed ? "px-3 lg:px-2" : "px-3")}>
          {groups.map((group, index) => <div key={group.name || index}>
            {group.name && <p className={"px-3 pb-2 text-sm font-semibold uppercase tracking-[0.12em] text-white/75 " +
              (collapsed ? "lg:sr-only" : "")}>{group.name}</p>}
            <div className="space-y-1">
              {group.items.map(item => {
                const Icon = item.icon;
                const contents = <>
                  <Icon className="h-[17px] w-[17px] shrink-0" aria-hidden="true" />
                  <span className={collapsed ? "lg:sr-only" : ""}>{item.label}</span>
                </>;
                const common = {
                  "aria-current": item.active ? "page" as const : undefined,
                  "aria-label": item.label,
                  title: item.label,
                  className: navClass(item.active),
                };
                return item.href
                  ? <Link key={item.id} href={item.href} {...common} target={item.external ? "_blank" : undefined} rel={item.external ? "noopener noreferrer" : undefined} onClick={() => handleSelect(item)}>{contents}</Link>
                  : <button key={item.id} type="button" {...common} onClick={() => handleSelect(item)}>{contents}</button>;
              })}
            </div>
          </div>)}
        </nav>
        <div className={"border-t border-white/25 px-5 py-4 " + (collapsed ? "lg:px-2" : "")}>
          <div className={collapsed ? "lg:hidden" : ""}>{footer}</div>
          <div className={collapsed ? "hidden lg:flex lg:justify-center" : "hidden"}>{compactFooter}</div>
        </div>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  </div>;
}
