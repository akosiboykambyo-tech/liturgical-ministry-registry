"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Menu, X } from "@/components/phosphor-icons";
import type { Icon as LucideIcon } from "@phosphor-icons/react";
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
export type PortalNavGroup = {
  name?: string;
  icon?: LucideIcon;
  separatorBefore?: boolean;
  items: PortalNavItem[];
};

export function DiocesanCoat({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="705 0 277 230"
      role="img" aria-label="Coat of arms of the Roman Catholic Diocese of Kalookan"
      className="shrink-0 overflow-hidden">
      <image href="/images/Asset_1.svg" x="0" y="0" width="1686.95" height="444.5" />
    </svg>
  );
}

/**
 * Match the original COWL-DOK Admin Dashboard interaction shown in the
 * 2026-11-09 reference recording:
 * - Desktop: sidebar expands on pointer hover / keyboard focus, then
 *   automatically collapses to the 76px icon rail on pointer exit.
 * - The chevron remains a manual fallback for touch and keyboard users.
 * - No sticky expanded preference, popovers, or detached primary menus.
 * - Content reflows with the changing 76px/260px sidebar width.
 * - Mobile/tablet: independent labeled overlay drawer (unchanged).
 * - Groups with deeper admin destinations expand inline, never in a popup.
 *
 * Mirrors the original Admin Dashboard recording supplied 2026-11-09.
 */
export default function PortalShell({
  title, subtitle, homeHref, navigationLabel, groups, footer,
  compactFooter, desktopMode = "items", children,
}: {
  title: string;
  subtitle: string;
  homeHref: string;
  navigationLabel: string;
  groups: PortalNavGroup[];
  footer: ReactNode;
  compactFooter: ReactNode;
  desktopMode?: "groups" | "items";
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopExpanded, setDesktopExpanded] = useState(false);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  useEffect(() => {
    setMobileOpen(false);
    setExpandedGroup(null);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [mobileOpen]);

  const toggleDesktop = () => {
    setDesktopExpanded(previous => {
      if (previous) setExpandedGroup(null);
      return !previous;
    });
  };

  // The original dashboard's responsive rail follows cursor presence.
  // Restrict hover behavior to desktop pointer devices so mobile/tablet
  // drawer interaction, keyboard, and touch are not hijacked by hover.
  const autoExpand = () => {
    if (window.matchMedia("(min-width: 1024px) and (hover: hover)").matches) {
      setDesktopExpanded(true);
    }
  };
  const autoCollapse = () => {
    if (window.matchMedia("(min-width: 1024px) and (hover: hover)").matches) {
      setDesktopExpanded(false);
      setExpandedGroup(null);
    }
  };

  const selectItem = (item: PortalNavItem) => {
    setMobileOpen(false);
    setExpandedGroup(null);
    item.onSelect?.();
  };

  function NavLink({ item, compact = false }: { item: PortalNavItem; compact?: boolean }) {
    const Icon = item.icon;
    const className = compact
      ? "grid h-11 w-11 shrink-0 place-items-center rounded-sm border-l-[3px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-white " +
        (item.active ? "border-white bg-white text-[#890022]" : "border-transparent text-white/90 hover:bg-white/15")
      : "flex min-h-11 w-full min-w-0 items-center gap-3 overflow-hidden border-l-[3px] py-2 pl-3 pr-4 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-white " +
        (item.active ? "border-white bg-white text-[#890022]" : "border-transparent text-white/90 hover:bg-white/15");
    const children = <>
      <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
      {!compact && <span className="min-w-0 flex-1 truncate whitespace-nowrap text-left">{item.label}</span>}
    </>;
    const props = {
      "aria-current": item.active ? "page" as const : undefined,
      "aria-label": item.label,
      title: item.label,
      className,
    };
    return item.href
      ? <Link key={item.id} href={item.href} {...props}
          target={item.external ? "_blank" : undefined}
          rel={item.external ? "noopener noreferrer" : undefined}
          onClick={() => selectItem(item)}>
          {children}
        </Link>
      : <button key={item.id} type="button" {...props} onClick={() => selectItem(item)}>
          {children}
        </button>;
  }

  return <div className={inter.className + " min-h-screen bg-[#FBF9F9] text-[#1E1114]"}>
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[#E6DADC] bg-white px-4 lg:hidden">
      <Link href={homeHref} className="flex min-w-0 items-center gap-2 text-sm font-semibold">
        <DiocesanCoat size={40} />
        <span className="truncate">{title}</span>
      </Link>
      <button type="button" aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
        aria-expanded={mobileOpen} aria-controls="portal-sidebar"
        onClick={() => setMobileOpen(value => !value)}
        className="grid h-11 w-11 shrink-0 place-items-center border border-[#E6DADC] text-[#890022]">
        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>
    </header>

    <div className="flex min-h-screen">
      {mobileOpen && <button type="button" aria-label="Close navigation"
        onClick={() => setMobileOpen(false)}
        className="fixed inset-0 z-40 bg-black/50 lg:hidden" />}

      <aside id="portal-sidebar" aria-label={navigationLabel}
        onMouseEnter={autoExpand}
        onMouseLeave={autoCollapse}
        onFocusCapture={event => {
          if (window.matchMedia("(min-width: 1024px)").matches &&
              event.target instanceof HTMLElement &&
              event.target.matches("a,button")) setDesktopExpanded(true);
        }}
        className={"fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col bg-[#890022] text-white transition-transform duration-200 lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:shrink-0 lg:translate-x-0 lg:transition-[width] lg:duration-300 lg:ease-in-out motion-reduce:transition-none " +
          (mobileOpen ? "translate-x-0 " : "-translate-x-full ") +
          (desktopExpanded ? "lg:w-[260px]" : "lg:w-[76px]")}>

        <div className={"flex min-h-[88px] items-center gap-3 overflow-hidden border-b border-white/20 py-4 " +
          (desktopExpanded ? "lg:px-5" : "lg:justify-center lg:px-1") +
          " px-5"}>
          <Link href={homeHref} onClick={() => setMobileOpen(false)}
            aria-label={title + " home"} title={title + " home"}
            className="flex h-14 w-14 shrink-0 items-center justify-center lg:h-12 lg:w-12">
            <DiocesanCoat size={desktopExpanded ? 44 : 38} />
          </Link>
          <div className={"min-w-0 whitespace-nowrap " + (desktopExpanded ? "" : "lg:sr-only")}>
            <p className={ebGaramond.className + " text-[23px] font-medium leading-none"}>{title}</p>
            <p className="mt-1 text-[13px] leading-4 text-white/80">{subtitle}</p>
          </div>
        </div>

        {/* Hover expands/collapses as on the original dashboard.
            The chevron is also available for keyboard and nonhover devices. */}
        <div className="hidden h-[72px] shrink-0 items-center justify-end border-b border-white/20 px-4 lg:flex">
          <button type="button" title={desktopExpanded ? "Collapse sidebar" : "Expand sidebar"}
            aria-label={desktopExpanded ? "Collapse sidebar" : "Expand sidebar"}
            aria-expanded={desktopExpanded} aria-controls="portal-desktop-navigation"
            onClick={toggleDesktop}
            className={"grid h-11 w-11 shrink-0 place-items-center rounded-sm transition-colors hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white " +
              (!desktopExpanded ? "mx-auto" : "")}>
            <ChevronRight className={"h-[18px] w-[18px] transition-transform duration-300 " +
              (desktopExpanded ? "rotate-180" : "")} aria-hidden="true" />
          </button>
        </div>

        <nav id="portal-desktop-navigation" aria-label={navigationLabel + " desktop"}
          className={"hidden min-h-0 flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden py-3 lg:flex " +
            (desktopExpanded ? "px-2" : "items-center px-2")}>
          {desktopMode === "groups"
            ? groups.map((group, index) => {
                const id = group.name || String(index);
                const active = group.items.some(item => item.active);
                const Icon = group.icon || group.items[0]?.icon;
                if (!Icon) return null;
                const single = group.items.length === 1;
                const expanded = expandedGroup === id;
                return <div key={id} className={"min-w-0 w-full " +
                  (group.separatorBefore ? "mt-2 border-t border-white/20 pt-2" : "")}>
                  {single
                    ? <div className={desktopExpanded ? "" : "flex justify-center"}>
                        <NavLink item={{ ...group.items[0], icon: Icon }} compact={!desktopExpanded} />
                      </div>
                    : <button type="button"
                        aria-label={group.name + " navigation"}
                        title={group.name}
                        aria-expanded={expanded}
                        onClick={() => {
                          if (!desktopExpanded) {
                            setDesktopExpanded(true);
                            setExpandedGroup(id);
                          } else {
                            setExpandedGroup(expanded ? null : id);
                          }
                        }}
                        className={(desktopExpanded
                          ? "flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left"
                          : "mx-auto grid h-11 w-11 place-items-center") +
                          " rounded-sm border-l-[3px] text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-white " +
                          (active || expanded
                            ? "border-white bg-white text-[#890022]"
                            : "border-transparent text-white/90 hover:bg-white/15")}>
                        <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                        {desktopExpanded && <span className="min-w-0 flex-1 truncate whitespace-nowrap">{group.name}</span>}
                        {desktopExpanded && <ChevronRight className={"h-4 w-4 shrink-0 transition-transform " +
                          (expanded ? "rotate-90" : "")} aria-hidden="true" />}
                      </button>}
                  {desktopExpanded && !single && expanded &&
                    <div className="mb-1 ml-5 border-l border-white/25 pl-2">
                      {group.items.map(item => <NavLink key={item.id} item={item} />)}
                    </div>}
                </div>;
              })
            : groups.map((group, index) =>
                <div key={group.name || index} className={"w-full " +
                  (group.separatorBefore ? "mt-2 border-t border-white/20 pt-2" : "")}>
                  <div className={desktopExpanded ? "space-y-1" : "flex flex-col items-center gap-1"}>
                    {group.items.map(item =>
                      <NavLink key={item.id} item={item} compact={!desktopExpanded} />)}
                  </div>
                </div>)}
        </nav>

        {/* Phone and tablet keep their original full-label drawer. */}
        <nav aria-label={navigationLabel + " mobile"}
          className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 py-6 lg:hidden">
          {groups.map((group, index) => <div key={group.name || index}>
            {group.name && <p className="px-3 pb-2 text-xs font-bold uppercase tracking-[0.12em] text-white/75">{group.name}</p>}
            <div className="space-y-1">{group.items.map(item => <NavLink key={item.id} item={item} />)}</div>
          </div>)}
        </nav>

        <div className={"border-t border-white/25 py-4 " +
          (desktopExpanded ? "lg:px-5" : "lg:px-2") + " px-5"}>
          <div className="lg:hidden">{footer}</div>
          <div className={desktopExpanded ? "hidden lg:block" : "hidden justify-center lg:flex"}>
            {desktopExpanded ? footer : compactFooter}
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  </div>;
}
