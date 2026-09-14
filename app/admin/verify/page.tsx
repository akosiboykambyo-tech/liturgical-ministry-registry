"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { quickVerifyMember } from "@/lib/verify-actions";
import { StatusBadge } from "@/components/status-badge";
import { shortMinistry, MINISTRIES, PARISHES } from "@/lib/constants";
import { Member } from "@/lib/types";
import { cn } from "@/lib/utils";
import { SearchableSelect } from "@/components/searchable-select";
import {
  ShieldCheck,
  Check,
  RefreshCw,
  Loader2,
  Search,
  Inbox,
  ChevronDown,
  CheckCheck,
  RotateCcw,
  AlertCircle,
  CheckSquare,
  X,
  Filter,
  Upload,
  FileCheck2,
} from "lucide-react";

type Toast = { id: number; type: "success" | "error"; msg: string };

type Filters = {
  parish: string;
  ministry: string;
};

const EMPTY_FILTERS: Filters = {
  parish: "All",
  ministry: "All",
};

export default function QuickScanMatrixPage() {
  const supabase = getSupabaseBrowserClient();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [optimisticIds, setOptimisticIds] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [massVerifying, setMassVerifying] = useState(false);
  const [massUploading, setMassUploading] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [expandedMobile, setExpandedMobile] = useState<string | null>(null);

  const loadPending = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("members")
      .select("*")
      .eq("status", "Pending Verification")
      .order("created_at", { ascending: true });
    if (!error) setMembers((data as Member[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadPending();

    const sub = supabase
      .channel("pending-members-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "members" },
        () => loadPending()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(sub);
    };
  }, [loadPending, supabase]);

  const pushToast = (type: Toast["type"], msg: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, type, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  };

  const handleVerify = async (
    member: Member,
    newStatus: "New" | "Renewed"
  ) => {
    setOptimisticIds((p) => ({ ...p, [member.id]: newStatus }));
    setBusyId(member.id);
    setTimeout(() => {
      setMembers((prev) => prev.filter((m) => m.id !== member.id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(member.id);
        return next;
      });
    }, 350);

    const { error } = await quickVerifyMember(member.id, newStatus);
    setBusyId(null);
    if (error) {
      pushToast("error", `Failed to verify ${member.first_name}: ${error}`);
      setOptimisticIds((p) => {
        const c = { ...p };
        delete c[member.id];
        return c;
      });
      loadPending();
    } else {
      pushToast(
        "success",
        `${member.first_name} ${member.last_name} verified as ${newStatus}. Certificate unlocked.`
      );
    }
  };

  const handleMassVerify = async (newStatus: "New" | "Renewed") => {
    if (selectedIds.size === 0) return;
    setMassVerifying(true);

    const selectedMembers = members.filter((m) => selectedIds.has(m.id));
    let successCount = 0;
    let failCount = 0;

    for (const member of selectedMembers) {
      setOptimisticIds((p) => ({ ...p, [member.id]: newStatus }));
      const { error } = await quickVerifyMember(member.id, newStatus);
      if (error) {
        failCount++;
        setOptimisticIds((p) => {
          const c = { ...p };
          delete c[member.id];
          return c;
        });
      } else {
        successCount++;
        setMembers((prev) => prev.filter((m) => m.id !== member.id));
      }
    }

    setMassVerifying(false);
    setSelectedIds(new Set());

    if (successCount > 0) {
      pushToast("success", `${successCount} member(s) verified as ${newStatus}. Certificates unlocked.`);
    }
    if (failCount > 0) {
      pushToast("error", `Failed to verify ${failCount} member(s).`);
    }
  };

  const filtered = useMemo(() => {
    // If no members loaded yet, return empty array
    if (!members || members.length === 0) return [];

    const q = search.trim().toLowerCase();

    // Normalize filter values - treat "All", "all", empty string, or whitespace-only as "no filter"
    const normalizeFilter = (val: string | undefined | null): string | null => {
      if (!val) return null;
      const normalized = val.trim().toLowerCase();
      // Treat "all" or empty as no filter
      if (!normalized || normalized === "all") return null;
      return normalized;
    };

    const parishFilter = normalizeFilter(filters.parish);
    const ministryFilter = normalizeFilter(filters.ministry);

    // If no filters are active, return all members
    if (!q && !parishFilter && !ministryFilter) {
      return members;
    }

    return members.filter((m) => {
      // Search filter - case-insensitive
      if (q) {
        const matchesSearch =
          `${m.first_name ?? ""} ${m.last_name ?? ""}`.toLowerCase().includes(q) ||
          (m.parish ?? "").toLowerCase().includes(q) ||
          (m.ministries ?? []).some((x) => (x ?? "").toLowerCase().includes(q));
        if (!matchesSearch) return false;
      }

      // Parish filter - case-insensitive
      if (parishFilter) {
        const memberParish = (m.parish ?? "").trim().toLowerCase();
        if (memberParish !== parishFilter) return false;
      }

      // Ministry filter - case-insensitive, check if any member ministry matches
      if (ministryFilter) {
        const memberMinistries = (m.ministries ?? []).map((min) => (min ?? "").trim().toLowerCase());
        if (!memberMinistries.some((min) => min === ministryFilter)) return false;
      }

      return true;
    });
  }, [members, search, filters]);

  const activeFilterCount =
    (filters.parish !== "All" ? 1 : 0) +
    (filters.ministry !== "All" ? 1 : 0);

  // Selection handlers
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const filteredIds = filtered.map((m) => m.id);
    const allSelected = filteredIds.every((id) => selectedIds.has(id));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredIds));
    }
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleMassUpload = async (file: File) => {
    if (selectedIds.size === 0) return;
    setMassUploading(true);

    const selectedMembers = members.filter((m) => selectedIds.has(m.id));
    const defaultExp = new Date();
    defaultExp.setFullYear(defaultExp.getFullYear() + 1);
    const newExpDate = defaultExp.toISOString().slice(0, 10);

    let successCount = 0;
    let failCount = 0;

    for (const member of selectedMembers) {
      const ext = file.name.split(".").pop();
      const path = `${member.id}/recommendation-letter.${ext}`;

      const { error: upErr } = await supabase.storage
        .from("member-documents")
        .upload(path, file, { upsert: true });
      if (upErr) {
        failCount++;
        continue;
      }

      const { error: dbErr } = await supabase
        .from("members")
        .update({
          document_url: path,
          expiration_date: newExpDate,
        })
        .eq("id", member.id);

      if (dbErr) {
        failCount++;
      } else {
        successCount++;
        setMembers((prev) =>
          prev.map((m) =>
            m.id === member.id
              ? { ...m, document_url: path, expiration_date: newExpDate }
              : m
          )
        );
      }
    }

    setMassUploading(false);

    if (successCount > 0) {
      pushToast("success", `Recommendation letter attached to ${successCount} member(s).`);
    }
    if (failCount > 0) {
      pushToast("error", `Failed to attach letter for ${failCount} member(s).`);
    }
  };

  return (
    <div className="space-y-5">
      {/* Toasts */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "flex items-start gap-2 rounded-md px-4 py-3 text-sm shadow-lg ring-1 animate-in-fade",
              t.type === "success"
                ? "bg-emerald-600 text-white ring-emerald-700"
                : "bg-destructive text-destructive-foreground ring-destructive"
            )}
          >
            {t.type === "success" ? (
              <Check className="h-4 w-4 mt-0.5 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            )}
            <span>{t.msg}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            Quick-Scan Verification Matrix
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Check off members as their physical recommendation letters arrive.
            One-click approval instantly unlocks the public certificate download.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-800 ring-1 ring-inset ring-amber-600/20">
            <span className="flex h-2 w-2 rounded-full bg-amber-500" />
            {members.length} pending
          </span>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="rounded-lg border border-border bg-card shadow-sm p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, parish, or ministry..."
            className="w-full rounded-md border border-input bg-background pl-10 pr-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-2 gap-2">
          <SearchableSelect
            options={PARISHES}
            value={filters.parish}
            onChange={(value) =>
              setFilters((f) => ({ ...f, parish: value }))
            }
            placeholder="All Parishes"
            searchPlaceholder="Search parishes..."
            emptyText="No parish matches."
          />
          <select
            value={filters.ministry}
            onChange={(e) => setFilters((f) => ({ ...f, ministry: e.target.value }))}
            className="rounded-md border border-input bg-background px-2.5 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring truncate"
          >
            <option value="All">All Ministries</option>
            {MINISTRIES.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
        {activeFilterCount > 0 && (
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Filter className="h-3.5 w-3.5" />
              {activeFilterCount} filter{activeFilterCount > 1 ? "s" : ""} active
            </span>
            <button
              onClick={() => setFilters(EMPTY_FILTERS)}
              className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1"
            >
              <X className="h-3 w-3" />
              Clear filters
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-16 text-center">
          <Inbox className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <p className="mt-3 text-sm font-medium text-muted-foreground">
            No pending members to verify.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            All recommendation letters have been processed.
          </p>
        </div>
      ) : (
        <>
          {/* Mass verify toolbar */}
          {selectedIds.size > 0 && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 animate-in slide-in-from-bottom-4 duration-200">
              <div className="flex items-center gap-3 rounded-full border border-border bg-background/95 backdrop-blur px-4 py-2.5 shadow-lg ring-1 ring-black/5">
                <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
                  <CheckSquare className="h-3.5 w-3.5" />
                  {selectedIds.size} Selected
                </span>
                <div className="h-5 w-px bg-border" />
                <label
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm font-semibold text-foreground hover:bg-muted transition-colors cursor-pointer disabled:opacity-60"
                  title="Attach the same recommendation letter to all selected members"
                >
                  {massUploading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Upload className="h-3.5 w-3.5" />
                  )}
                  Attach letter
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    disabled={massUploading || massVerifying}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleMassUpload(f);
                      e.target.value = "";
                    }}
                  />
                </label>
                <div className="h-5 w-px bg-border" />
                <button
                  onClick={() => handleMassVerify("New")}
                  disabled={massVerifying || massUploading}
                  className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-2.5 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors disabled:opacity-60"
                >
                  {massVerifying ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  Verify as New
                </button>
                <button
                  onClick={() => handleMassVerify("Renewed")}
                  disabled={massVerifying || massUploading}
                  className="inline-flex items-center gap-1.5 rounded-md bg-sky-600 px-2.5 py-1.5 text-sm font-semibold text-white hover:bg-sky-700 transition-colors disabled:opacity-60"
                >
                  {massVerifying ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  Verify as Renewed
                </button>
                <div className="h-5 w-px bg-border" />
                <button
                  onClick={clearSelection}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* Desktop table */}
          <div className="hidden lg:block rounded-lg border border-border bg-card shadow-sm overflow-hidden">
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 border-b border-border">
                  <tr className="text-left">
                    <th className="px-4 py-3 w-10">
                      <label className="inline-flex items-center justify-center">
                        <input
                          type="checkbox"
                          checked={filtered.length > 0 && filtered.every((m) => selectedIds.has(m.id))}
                          ref={(el) => {
                            if (el) el.indeterminate = selectedIds.size > 0 && !filtered.every((m) => selectedIds.has(m.id));
                          }}
                          onChange={toggleSelectAll}
                          className="h-4 w-4 rounded border-input text-primary focus:ring-ring cursor-pointer"
                          aria-label="Select all"
                        />
                      </label>
                    </th>
                    <th className="px-4 py-3 font-semibold text-muted-foreground">Name</th>
                    <th className="px-4 py-3 font-semibold text-muted-foreground">Parish</th>
                    <th className="px-4 py-3 font-semibold text-muted-foreground">Ministries</th>
                    <th className="px-4 py-3 font-semibold text-muted-foreground">UID</th>
                    <th className="px-4 py-3 font-semibold text-center text-muted-foreground">Verify Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((m) => {
                    const optimistic = optimisticIds[m.id];
                    const isBusy = busyId === m.id;
                    const isSelected = selectedIds.has(m.id);
                    return (
                      <tr
                        key={m.id}
                        className={cn(
                          "transition-colors",
                          optimistic
                            ? "bg-emerald-50 opacity-60"
                            : isSelected
                            ? "bg-primary/5"
                            : "hover:bg-muted/30"
                        )}
                      >
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(m.id)}
                            className="h-4 w-4 rounded border-input text-primary focus:ring-ring cursor-pointer"
                            aria-label={`Select ${m.first_name} ${m.last_name}`}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium">
                            {m.first_name} {m.last_name}
                          </div>
                          <StatusBadge status="Pending Verification" showIcon={false} className="mt-0.5" />
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{m.parish}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {m.ministries.map((min) => (
                              <span
                                key={min}
                                className="inline-flex rounded bg-accent px-1.5 py-0.5 text-[11px] font-medium text-accent-foreground"
                              >
                                {shortMinistry(min)}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <code className="text-xs text-muted-foreground">{m.uid}</code>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1.5">
                            {m.document_url && (
                              <span
                                className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1.5 text-xs font-medium text-emerald-700"
                                title="Recommendation letter attached"
                              >
                                <FileCheck2 className="h-3 w-3" />
                              </span>
                            )}
                            <button
                              onClick={() => handleVerify(m, "New")}
                              disabled={isBusy}
                              className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
                              title="Approve as New (first-time server)"
                            >
                              {isBusy ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Check className="h-3 w-3" />
                              )}
                              New
                            </button>
                            <button
                              onClick={() => handleVerify(m, "Renewed")}
                              disabled={isBusy}
                              className="inline-flex items-center gap-1 rounded-md bg-sky-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-sky-700 transition-colors disabled:opacity-50"
                              title="Approve as Renewed (returning server)"
                            >
                              <RefreshCw className="h-3 w-3" />
                              Renewed
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile accordion cards */}
          <div className="lg:hidden space-y-2">
            {filtered.map((m) => {
              const optimistic = optimisticIds[m.id];
              const isBusy = busyId === m.id;
              const isExpanded = expandedMobile === m.id;
              const isSelected = selectedIds.has(m.id);
              return (
                <div
                  key={m.id}
                  className={cn(
                    "rounded-lg border border-border bg-card overflow-hidden transition-opacity",
                    optimistic && "opacity-50"
                  )}
                >
                  <div className="flex items-center gap-2 p-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(m.id)}
                      className="h-4 w-4 rounded border-input text-primary focus:ring-ring cursor-pointer"
                      aria-label={`Select ${m.first_name} ${m.last_name}`}
                    />
                    <button
                      onClick={() => setExpandedMobile(isExpanded ? null : m.id)}
                      className="flex-1 flex items-center justify-between text-left min-w-0"
                    >
                      <div className="min-w-0">
                        <p className="font-medium truncate">
                          {m.first_name} {m.last_name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{m.parish}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <StatusBadge status="Pending Verification" showIcon={false} />
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 text-muted-foreground transition-transform",
                            isExpanded && "rotate-180"
                          )}
                        />
                      </div>
                    </button>
                  </div>
                  {isExpanded && (
                    <div className="border-t border-border p-3 space-y-3 animate-in-fade">
                      <div className="flex flex-wrap gap-1">
                        {m.ministries.map((min) => (
                          <span
                            key={min}
                            className="inline-flex rounded bg-accent px-1.5 py-0.5 text-[11px] font-medium text-accent-foreground"
                          >
                            {shortMinistry(min)}
                          </span>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        UID: <code>{m.uid}</code>
                      </p>
                      <div className="space-y-2">
                        {m.document_url && (
                          <div className="flex items-center justify-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
                            <FileCheck2 className="h-3.5 w-3.5" />
                            Recommendation letter attached
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => handleVerify(m, "New")}
                            disabled={isBusy}
                            className="inline-flex items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
                          >
                            {isBusy ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <CheckCheck className="h-4 w-4" />
                            )}
                            Approve as New
                          </button>
                          <button
                            onClick={() => handleVerify(m, "Renewed")}
                            disabled={isBusy}
                            className="inline-flex items-center justify-center gap-1.5 rounded-md bg-sky-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 transition-colors disabled:opacity-50"
                          >
                            <RotateCcw className="h-4 w-4" />
                            Approve as Renewed
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      <div className="text-xs text-muted-foreground flex items-center gap-1.5">
        <ShieldCheck className="h-3.5 w-3.5" />
        Verification automatically generates the member UID, public validation URL,
        QR code, and unlocks the certificate download. Select multiple members
        from the same parish to attach a shared recommendation letter, then verify.
      </div>
    </div>
  );
}
