"use client";

import { useEffect, useState, useCallback } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { Member, AuditLog } from "@/lib/types";
import {
  ScrollText,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Filter,
} from "lucide-react";

const PAGE_SIZE = 30;

export default function AuditTrailPage() {
  const supabase = getSupabaseBrowserClient();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [members, setMembers] = useState<Record<string, Member>>({});
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [actionFilter, setActionFilter] = useState("All");

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase.from("audit_logs").select("*", { count: "exact" });
    if (actionFilter !== "All") {
      query = query.eq("admin_action", actionFilter);
    }
    query = query
      .order("timestamp", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    const { data, count } = await query;
    const list = (data as AuditLog[]) ?? [];
    setLogs(list);
    setTotal(count ?? 0);

    const ids = list.map((l) => l.member_id).filter(Boolean) as string[];
    if (ids.length > 0) {
      const { data: memData } = await supabase
        .from("members")
        .select("*")
        .in("id", ids);
      const map: Record<string, Member> = {};
      for (const m of (memData as Member[]) ?? []) {
        map[m.id] = m;
      }
      setMembers(map);
    }
    setLoading(false);
  }, [supabase, actionFilter, page]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const ACTIONS = ["All", "Manual Creation", "Status Update", "Profile Update"];

  function diffSummary(log: AuditLog): string {
    const prev = log.previous_state as Record<string, unknown> | null;
    const next = log.new_state as Record<string, unknown> | null;
    if (!prev) return "Initial creation of member record.";
    const changes: string[] = [];
    if (prev.status !== next?.status) {
      changes.push(`Status: "${prev.status}" → "${next?.status}"`);
    }
    if (JSON.stringify(prev.ministries) !== JSON.stringify(next?.ministries)) {
      changes.push("Ministries updated");
    }
    if (prev.parish !== next?.parish) {
      changes.push(`Parish: "${prev.parish}" → "${next?.parish}"`);
    }
    if (prev.notes !== next?.notes) {
      changes.push("Notes updated");
    }
    if (prev.document_url !== next?.document_url) {
      changes.push("Document link updated");
    }
    return changes.length > 0 ? changes.join("; ") : "No field-level changes.";
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ScrollText className="h-6 w-6 text-primary" />
            Audit Trail
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Read-only log of all data changes across the registry.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <select
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value);
              setPage(0);
            }}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {ACTIONS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : logs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
          No audit entries.
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-border bg-card shadow-sm overflow-hidden">
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 border-b border-border">
                  <tr className="text-left">
                    <th className="px-4 py-3 font-semibold text-muted-foreground">Timestamp</th>
                    <th className="px-4 py-3 font-semibold text-muted-foreground">Member</th>
                    <th className="px-4 py-3 font-semibold text-muted-foreground">Action</th>
                    <th className="px-4 py-3 font-semibold text-muted-foreground">Change Summary</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {logs.map((log) => {
                    const m = log.member_id ? members[log.member_id] : null;
                    return (
                      <tr key={log.id} className="align-top hover:bg-muted/20">
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(log.timestamp).toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          {m ? (
                            <span className="font-medium">
                              {m.first_name} {m.last_name}
                              <span className="block text-xs text-muted-foreground font-normal">{m.uid}</span>
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex rounded bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">
                            {log.admin_action}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground max-w-md">
                          {diffSummary(log)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <p className="text-xs text-muted-foreground">
                Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
              </p>
              <div className="flex gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="rounded-md border border-border p-1.5 hover:bg-muted disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="flex items-center px-3 text-xs text-muted-foreground">
                  {page + 1} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="rounded-md border border-border p-1.5 hover:bg-muted disabled:opacity-40"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
