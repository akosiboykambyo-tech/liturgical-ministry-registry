"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Menu, X, type LucideIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
 * Consistent simplified diocesan navigation:
 * - Desktop: a fixed-width icon rail, with contextual menus for admin groups.
 * - Mobile: a drawer showing the same items with full text labels.
 *
 * The legacy desktop expanded/collapsed preference is intentionally ignored:
 * a saved "expanded" flag must not revive the cluttered sidebar.
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
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [allOpen, setAllOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
    setOpenGroup(null);
    setAllOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [mobileOpen]);

  const selectItem = (item: PortalNavItem) => {
    setMobileOpen(false);
    setOpenGroup(null);
    setAllOpen(false);
    item.onSelect?.();
  };

  function NavLink({ item, compact = false }: { item: PortalNavItem; compact?: boolean }) {
    const Icon = item.icon;
    const className = compact
      ? "grid h-11 w-11 place-items-center rounded-sm border-l-[3px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-white " +
        (item.active ? "border-white bg-white text-[#890022]" : "border-transparent text-white/90 hover:bg-white/15")
      : "flex min-h-11 items-center gap-3 border-l-[3px] px-3 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-white " +
        (item.active ? "border-white bg-white text-[#890022]" : "border-transparent text-white/90 hover:bg-white/15");
    const children = <>
      <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
      {!compact && <span className="min-w-0">{item.label}</span>}
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
        className={"fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col bg-[#890022] text-white transition-transform duration-200 lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:w-[76px] lg:shrink-0 lg:translate-x-0 " +
          (mobileOpen ? "translate-x-0" : "-translate-x-full")}>

        <div className="flex min-h-[88px] items-center gap-3 border-b border-white/20 px-5 py-4 lg:justify-center lg:px-1">
          <Link href={homeHref} onClick={() => setMobileOpen(false)}
            aria-label={title + " home"} title={title + " home"}
            className="flex h-14 w-14 shrink-0 items-center justify-center lg:h-12 lg:w-12">
            <DiocesanCoat size={46} />
          </Link>
          <div className="min-w-0 lg:sr-only">
            <p className={ebGaramond.className + " text-[23px] font-medium leading-none"}>{title}</p>
            <p className="mt-1 text-[13px] leading-4 text-white/80">{subtitle}</p>
          </div>
        </div>

        {/* Desktop compact rail: the chevron opens the detailed navigation only on request. */}
        <div className="hidden h-[72px] shrink-0 items-center justify-center border-b border-white/20 lg:flex">
          <Popover open={allOpen} onOpenChange={setAllOpen}>
            <PopoverTrigger asChild>
              <button type="button" title="Show all navigation"
                aria-label="Show all navigation" aria-expanded={allOpen}
                className={"grid h-11 w-11 place-items-center rounded-sm transition-colors hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white " +
                  (allOpen ? "bg-white text-[#890022]" : "text-white")}>
                <ChevronRight className={"h-[18px] w-[18px] transition-transform " + (allOpen ? "rotate-180" : "")} aria-hidden="true" />
              </button>
            </PopoverTrigger>
            <PopoverContent side="right" sideOffset={12} align="start"
              className="max-h-[min(80vh,650px)] w-[290px] overflow-y-auto rounded-sm border border-[#E6DADC] bg-white p-3 shadow-xl">
              <p className="px-2 pb-3 text-xs font-bold uppercase tracking-wider text-[#890022]">Navigation</p>
              <div className="space-y-3">
                {groups.map((group, index) => <div key={group.name || index}>
                  {group.name && <p className="px-2 pb-1.5 text-[11px] font-bold uppercase tracking-wide text-[#79676D]">{group.name}</p>}
                  {group.items.map(item => {
                    const Icon = item.icon;
                    return item.href
                      ? <Link key={item.id} href={item.href}
                          aria-current={item.active ? "page" : undefined}
                          target={item.external ? "_blank" : undefined}
                          rel={item.external ? "noopener noreferrer" : undefined}
                          onClick={() => selectItem(item)}
                          className={"flex min-h-9 items-center gap-2 rounded-sm px-2 py-2 text-sm " +
                            (item.active ? "bg-[#F8EDEF] font-semibold text-[#890022]" : "text-[#49363A] hover:bg-[#FBF9F9]")}>
                          <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />{item.label}
                        </Link>
                      : <button key={item.id} type="button" onClick={() => selectItem(item)}
                          className={"flex min-h-9 w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm " +
                            (item.active ? "bg-[#F8EDEF] font-semibold text-[#890022]" : "text-[#49363A] hover:bg-[#FBF9F9]")}>
                          <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />{item.label}
                        </button>;
                  })}
                </div>)}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Desktop: only top-level icons; deeper actions appear on demand. */}
        <nav aria-label={navigationLabel + " compact"} className="hidden min-h-0 flex-1 flex-col items-center gap-0 overflow-y-auto px-2 py-1 lg:flex">
          {desktopMode === "groups"
            ? groups.map((group, index) => {
                const id = group.name || String(index);
                const active = group.items.some(item => item.active);
                const Icon = group.icon || group.items[0]?.icon;
                if (!Icon) return null;
                if (group.items.length === 1) return <div key={id} className={group.separatorBefore ? "mt-2 border-t border-white/20 pt-2" : ""}>
                  <NavLink item={{ ...group.items[0], icon: Icon }} compact />
                </div>;
                return <Popover key={id} open={openGroup === id}
                  onOpenChange={opened => setOpenGroup(opened ? id : null)}>
                  <PopoverTrigger asChild>
                    <button type="button" aria-label={group.name + " navigation"}
                      title={group.name} aria-expanded={openGroup === id}
                      className={"grid h-11 w-11 place-items-center rounded-sm border-l-[3px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-white " +
                        (active || openGroup === id
                          ? "border-white bg-white text-[#890022]"
                          : "border-transparent text-white/90 hover:bg-white/15")}>
                      <Icon className="h-[19px] w-[19px]" aria-hidden="true" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent side="right" align="start" sideOffset={12}
                    className="w-[280px] rounded-sm border border-[#E6DADC] bg-white p-2 shadow-xl">
                    <p className="px-3 py-2 text-xs font-bold uppercase tracking-[0.11em] text-[#890022]">{group.name}</p>
                    <div className="space-y-1">
                      {group.items.map(item => {
                        const ItemIcon = item.icon;
                        const cls = "flex min-h-10 w-full items-center gap-3 rounded-sm px-3 py-2 text-left text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#890022] " +
                          (item.active ? "bg-[#F8EDEF] font-semibold text-[#890022]" : "text-[#49363A] hover:bg-[#FBF9F9]");
                        const label = <><ItemIcon className="h-4 w-4 shrink-0" aria-hidden="true" />{item.label}</>;
                        return item.href
                          ? <Link key={item.id} href={item.href} aria-current={item.active ? "page" : undefined}
                              target={item.external ? "_blank" : undefined}
                              rel={item.external ? "noopener noreferrer" : undefined}
                              className={cls} onClick={() => selectItem(item)}>{label}</Link>
                          : <button key={item.id} type="button" className={cls}
                              onClick={() => selectItem(item)}>{label}</button>;
                      })}
                    </div>
                  </PopoverContent>
                </Popover>;
              })
            : groups.flatMap(group => group.items).map(item =>
                <NavLink key={item.id} item={item} compact />)}
        </nav>

        {/* Phone and tablet: full labels are inside the drawer, never left open on the page. */}
        <nav aria-label={navigationLabel + " mobile"} className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 py-6 lg:hidden">
          {groups.map((group, index) => <div key={group.name || index}>
            {group.name && <p className="px-3 pb-2 text-xs font-bold uppercase tracking-[0.12em] text-white/75">{group.name}</p>}
            <div className="space-y-1">{group.items.map(item => <NavLink key={item.id} item={item} />)}</div>
          </div>)}
        </nav>

        <div className="border-t border-white/25 px-5 py-4 lg:px-2">
          <div className="lg:hidden">{footer}</div>
          <div className="hidden justify-center lg:flex">{compactFooter}</div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  </div>;
}
