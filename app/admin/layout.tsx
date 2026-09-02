"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";
import {
  Church,
  ShieldCheck,
  LayoutDashboard,
  Users,
  Upload,
  ScrollText,
  Image as ImageIcon,
  LogOut,
  Loader2,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/members", label: "Members", icon: Users },
  { href: "/admin/verify", label: "Quick-Scan Matrix", icon: ShieldCheck },
  { href: "/admin/import", label: "CSV Import", icon: Upload },
  { href: "/admin/audit", label: "Audit Trail", icon: ScrollText },
  { href: "/admin/certificates", label: "Certificate Templates", icon: ImageIcon },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isLoginPage = pathname === "/admin";

  useEffect(() => {
    if (!loading && !user && !isLoginPage) {
      router.replace("/admin");
    }
  }, [user, loading, isLoginPage, router]);

  if (isLoginPage) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return null; // redirect in flight
  }

  const handleSignOut = async () => {
    await signOut();
    router.replace("/admin");
  };

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Mobile top bar */}
      <div className="lg:hidden sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Church className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold">Admin Portal</span>
        </div>
        <button
          onClick={() => setSidebarOpen((s) => !s)}
          className="rounded-md p-2 hover:bg-muted"
          aria-label="Toggle menu"
        >
          {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      <div className="flex">
        {/* Sidebar */}
        <aside
          className={cn(
            "fixed lg:sticky top-0 z-40 h-screen w-64 shrink-0 border-r border-border bg-background transition-transform lg:translate-x-0",
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <div className="flex h-16 items-center gap-2.5 border-b border-border px-5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <Church className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold leading-tight">Admin Portal</p>
              <p className="text-[11px] text-muted-foreground">Liturgical Registry</p>
            </div>
          </div>

          <nav className="flex flex-col gap-0.5 p-3 overflow-y-auto h-[calc(100vh-4rem-8.5rem)] scrollbar-thin">
            {NAV.map((item) => {
              const active = pathname === item.href || (item.href !== "/admin/dashboard" && pathname?.startsWith(item.href));
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="absolute bottom-0 left-0 right-0 border-t border-border p-3">
            <div className="mb-3 flex justify-center px-2">
              <Image
                src="/images/Asset_1.svg"
                alt="Liturgical Ministry Registry"
                width={140}
                height={56}
                className="h-10 sm:h-12 w-auto"
              />
            </div>
            <div className="mb-2 px-2 text-xs text-muted-foreground truncate">
              {user.email}
            </div>
            <button
              onClick={handleSignOut}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          </div>
        </aside>

        {sidebarOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main content */}
        <main className="flex-1 min-w-0">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
