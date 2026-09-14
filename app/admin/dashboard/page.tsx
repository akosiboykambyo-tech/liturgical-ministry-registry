"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { StatusBadge } from "@/components/status-badge";
import { Member } from "@/lib/types";
import {
  Users,
  ShieldCheck,
  Clock,
  ArrowRight,
  UserPlus,
  Upload,
  CheckCheck,
} from "lucide-react";

export default function AdminDashboardPage() {
  const supabase = getSupabaseBrowserClient();
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    verified: 0,
  });
  const [recent, setRecent] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [countRes, pendingRes, verifiedRes] = await Promise.all([
        supabase.from("members").select("id", { count: "exact", head: true }),
        supabase
          .from("members")
          .select("id", { count: "exact", head: true })
          .eq("status", "Pending Verification"),
        supabase
          .from("members")
          .select("id", { count: "exact", head: true })
          .in("status", ["New", "Renewed"]),
      ]);
      setStats({
        total: countRes.count ?? 0,
        pending: pendingRes.count ?? 0,
        verified: verifiedRes.count ?? 0,
      });

      const { data: recentData } = await supabase
        .from("members")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(5);
      setRecent((recentData as Member[]) ?? []);
      setLoading(false);
    })();
  }, [supabase]);

  const cards = [
    {
      label: "Total Members",
      value: stats.total,
      icon: Users,
      color: "text-sky-600 bg-sky-50",
    },
    {
      label: "Pending Verification",
      value: stats.pending,
      icon: Clock,
      color: "text-amber-600 bg-amber-50",
    },
    {
      label: "Verified Active",
      value: stats.verified,
      icon: ShieldCheck,
      color: "text-emerald-600 bg-emerald-50",
    },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Overview of the liturgical ministry registry.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/import"
            className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted transition-colors"
          >
            <Upload className="h-4 w-4" />
            Import CSV
          </Link>
          <Link
            href="/admin/members/add"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
          >
            <UserPlus className="h-4 w-4" />
            Add Member
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div
              key={c.label}
              className="hover-lift rounded-lg border border-border bg-card p-5 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div className={c.color + " flex h-9 w-9 items-center justify-center rounded-md"}>
                  <Icon className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-3 text-3xl font-bold tracking-tight">
                {loading ? "—" : c.value}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{c.label}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold">Recently Added Members</h2>
            <Link
              href="/admin/members"
              className="text-xs text-primary hover:underline inline-flex items-center gap-1"
            >
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {recent.length === 0 && !loading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No members yet. Add one to get started.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {recent.map((m) => (
                <li key={m.id} className="flex items-center justify-between py-2.5 gap-3">
                  <div className="min-w-0">
                    <Link
                      href="/admin/members"
                      className="text-sm font-medium hover:text-primary truncate block"
                    >
                      {m.first_name} {m.last_name}
                    </Link>
                    <p className="text-xs text-muted-foreground truncate">
                      {m.parish}
                    </p>
                  </div>
                  <StatusBadge status={m.status} showIcon={false} />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <h2 className="text-sm font-semibold mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Link
              href="/admin/verify"
              className="group rounded-lg border border-border p-4 hover:border-primary/50 hover:bg-accent/40 transition-all"
            >
              <CheckCheck className="h-5 w-5 text-primary mb-2" />
              <p className="text-sm font-medium">Quick-Scan Verification</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Approve pending members from the physical desk stack.
              </p>
            </Link>
            <Link
              href="/admin/import"
              className="group rounded-lg border border-border p-4 hover:border-primary/50 hover:bg-accent/40 transition-all"
            >
              <Upload className="h-5 w-5 text-primary mb-2" />
              <p className="text-sm font-medium">Bulk CSV Import</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Import members at the start of the liturgical year.
              </p>
            </Link>

            <Link
              href="/admin/certificates"
              className="group rounded-lg border border-border p-4 hover:border-primary/50 hover:bg-accent/40 transition-all"
            >
              <ShieldCheck className="h-5 w-5 text-primary mb-2" />
              <p className="text-sm font-medium">Certificate Template</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Configure the official certificate overlay layout.
              </p>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
