"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { StatusBadge } from "@/components/status-badge";
import { MemberDetailDrawer } from "@/components/member-detail-drawer";
import {
  MINISTRIES,
  PARISHES,
  STATUS_VALUES,
  shortMinistry,
} from "@/lib/constants";
import type { Member } from "@/lib/types";
import {
  Loader2,
  Search,
  UserPlus,
  ChevronLeft,
  ChevronRight,
  Download,
  Printer,
  X,
  Filter,
  SlidersHorizontal,
  MoreVertical,
  Pencil,
  Trash2,
  Eye,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiSelectCombobox } from "@/components/multi-select-combobox";

const PAGE_SIZE = 20;

type Filters = {
  parish: string[];
  ministry: string[];
  year: string;
  status: string[];
};

const EMPTY_FILTERS: Filters = {
  parish: [],
  ministry: [],
  year: "All",
  status: [],
};

export default function MembersListPage() {
  const supabase = getSupabaseBrowserClient();
  const { toast } = useToast();

  const [members, setMembers] = useState<Member[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reportOpen, setReportOpen] = useState(false);
  const [reportMembers, setReportMembers] = useState<Member[]>([]);
  const [availableYears, setAvailableYears] = useState<string[]>([]);

  // Member detail drawer
  const [drawerMemberId, setDrawerMemberId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Inline name correction + delete (user-error fixes to avoid duplicates)
  const [editTarget, setEditTarget] = useState<Member | null>(null);
  const [editFirst, setEditFirst] = useState("");
  const [editLast, setEditLast] = useState("");
  const [editParish, setEditParish] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Member | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Debounce search input
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      setSearch(searchInput);
      setPage(0);
    }, 300);
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchInput]);

  // Load available years for filter dropdown
  useEffect(() => {
    const loadYears = async () => {
      const { data, error } = await supabase
        .from("members")
        .select("uid")
        .not("uid", "eq", "PENDING");
      if (!error && data) {
        const years = new Set<string>();
        for (const m of data) {
          const match = m.uid?.match(/^LMD-(\d{4})-/);
          if (match) years.add(match[1]);
        }
        setAvailableYears(Array.from(years).sort((a, b) => b.localeCompare(a)));
      }
    };
    loadYears();
  }, [supabase]);

  // Server-side search and filtering
  const loadMembers = useCallback(async () => {
    setLoading(true);

    let query = supabase
      .from("members")
      .select("*", { count: "exact" });

    // Apply search filter (server-side, case-insensitive)
    const searchTrimmed = search.trim();
    if (searchTrimmed) {
      // Use ilike for case-insensitive partial matching on name or UID
      // We'll use an or clause to search across multiple fields
      query = query.or(
        `first_name.ilike.%${searchTrimmed}%,last_name.ilike.%${searchTrimmed}%,parish.ilike.%${searchTrimmed}%,uid.ilike.%${searchTrimmed}%`
      );
    }

    // Apply parish filter (member matches ANY selected parish)
    if (filters.parish.length > 0) {
      query = query.in("parish", filters.parish);
    }

    // Apply ministry filter (member matches ANY selected ministry)
    if (filters.ministry.length > 0) {
      query = query.overlaps("ministries", filters.ministry);
    }

    // Apply year filter (UID starts with LMD-YYYY-)
    if (filters.year && filters.year !== "All") {
      query = query.ilike("uid", `LMD-${filters.year}-%`);
    }

    // Apply status filter (member matches ANY selected status)
    if (filters.status.length > 0) {
      query = query.in("status", filters.status);
    }

    // Apply pagination
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    query = query.range(from, to).order("created_at", { ascending: false });

    const { data, error, count } = await query;

    if (error) {
      toast({
        title: "Failed to load members",
        description: error.message,
        variant: "destructive",
      });
      setMembers([]);
      setTotalCount(0);
    } else {
      setMembers((data as Member[]) ?? []);
      setTotalCount(count ?? 0);
    }

    setLoading(false);
  }, [supabase, search, filters, page, toast]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [filters]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const activeFilterCount =
    filters.parish.length +
    filters.ministry.length +
    (filters.year !== "All" ? 1 : 0) +
    filters.status.length;

  const isActiveSearch = search.trim().length > 0;

  // --- Selection logic ---
  const pageMemberIds = members.map((m) => m.id);
  const allOnPageSelected =
    pageMemberIds.length > 0 && pageMemberIds.every((id) => selected.has(id));
  const someOnPageSelected = pageMemberIds.some((id) => selected.has(id));

  const togglePage = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        for (const id of pageMemberIds) next.delete(id);
      } else {
        for (const id of pageMemberIds) next.add(id);
      }
      return next;
    });
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  // --- CSV export ---
  const exportCsv = async () => {
    const escape = (v: string) => `"${(v ?? "").replace(/"/g, '""')}"`;
    const header = [
      "UID",
      "First Name",
      "Last Name",
      "Parish",
      "Ministries",
      "Status",
      "Created At",
    ].join(",");

    // Fetch selected members
    const selectedList = Array.from(selected);
    if (selectedList.length === 0) {
      toast({
        title: "No members selected",
        description: "Select members to export or use the current filter.",
        variant: "destructive",
      });
      return;
    }

    const { data, error } = await supabase
      .from("members")
      .select("*")
      .in("id", selectedList);

    if (error) {
      toast({
        title: "Export failed",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    const membersToExport = (data as Member[]) ?? [];
    const rows = membersToExport.map((m) =>
      [
        escape(m.uid),
        escape(m.first_name),
        escape(m.last_name),
        escape(m.parish),
        escape(m.ministries.join("; ")),
        escape(m.status),
        escape(m.created_at),
      ].join(",")
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `members-export-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({
      title: "CSV exported",
      description: `${membersToExport.length} member(s) downloaded.`,
    });
  };

  // --- Inline name correction (fix typos that cause duplicate flags) ---
  const openEdit = (m: Member) => {
    setEditTarget(m);
    setEditFirst(m.first_name);
    setEditLast(m.last_name);
    setEditParish(m.parish);
  };

  const handleSaveEdit = async () => {
    if (!editTarget) return;
    const first = editFirst.trim();
    const last = editLast.trim();
    const parish = editParish.trim();
    if (!first || !last || !parish) {
      toast({
        title: "Missing fields",
        description: "First name, last name, and parish are required.",
        variant: "destructive",
      });
      return;
    }
    setSavingEdit(true);
    const { error } = await supabase
      .from("members")
      .update({ first_name: first, last_name: last, parish })
      .eq("id", editTarget.id);
    setSavingEdit(false);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: "Member corrected",
      description: `${editTarget.first_name} ${editTarget.last_name} → ${first} ${last}.`,
    });
    setEditTarget(null);
    loadMembers();
  };

  // --- Delete a record created by user error ---
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    // Remove any linked document first (best-effort).
    if (deleteTarget.document_url) {
      await supabase.storage.from("member-documents").remove([deleteTarget.document_url]);
    }
    const { error } = await supabase.from("members").delete().eq("id", deleteTarget.id);
    setDeleting(false);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: "Record deleted",
      description: `${deleteTarget.first_name} ${deleteTarget.last_name} (${deleteTarget.uid}) removed.`,
    });
    setDeleteTarget(null);
    loadMembers();
  };

  return (
    <div className="space-y-5 pb-24">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Members</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {totalCount.toLocaleString()} total member(s)
            {isActiveSearch && ` · ${totalCount.toLocaleString()} matching "${search.trim()}"`}
            {selected.size > 0 && ` · ${selected.size} selected`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setReportMembers(members);
              setReportOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted transition-colors shadow-sm print:hidden"
          >
            <Printer className="h-4 w-4" />
            Print List
          </button>
          <Link
            href="/admin/members/add"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm print:hidden"
          >
            <UserPlus className="h-4 w-4" />
            Add Member
          </Link>
        </div>
      </div>

      {/* Filter bar */}
      <div className="rounded-lg border border-border bg-card shadow-sm p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name, parish, or UID..."
            className="w-full rounded-md border border-input bg-background pl-10 pr-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <MultiSelectCombobox
            options={PARISHES as readonly string[]}
            selected={filters.parish}
            onChange={(v) => setFilters((f) => ({ ...f, parish: v }))}
            placeholder="All Parishes"
            searchPlaceholder="Search parishes..."
            emptyText="No parish matches."
            formatBadge={(v) => (v.length > 18 ? `${v.slice(0, 16)}…` : v)}
          />
          <MultiSelectCombobox
            options={MINISTRIES as readonly string[]}
            selected={filters.ministry}
            onChange={(v) => setFilters((f) => ({ ...f, ministry: v }))}
            placeholder="All Ministries"
            searchPlaceholder="Search ministries..."
            emptyText="No ministry matches."
            formatBadge={(v) => shortMinistry(v)}
          />
          <FilterSelect
            value={filters.year}
            onChange={(v) => setFilters((f) => ({ ...f, year: v }))}
            options={availableYears}
            label="Year"
            allLabel="All Years"
          />
          <MultiSelectCombobox
            options={STATUS_VALUES}
            selected={filters.status}
            onChange={(v) => setFilters((f) => ({ ...f, status: v }))}
            placeholder="All Statuses"
            searchPlaceholder="Search statuses..."
            emptyText="No status matches."
          />
        </div>
        {(activeFilterCount > 0 || isActiveSearch) && (
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground mr-1">
              <Filter className="h-3.5 w-3.5" />
              Active:
            </span>
            {isActiveSearch && (
              <FilterChip
                label={`"${search.trim()}"`}
                onRemove={() => {
                  setSearchInput("");
                  setSearch("");
                }}
              />
            )}
            {filters.parish.map((p) => (
              <FilterChip
                key={`p-${p}`}
                label={p}
                onRemove={() =>
                  setFilters((f) => ({ ...f, parish: f.parish.filter((x) => x !== p) }))
                }
              />
            ))}
            {filters.ministry.map((m) => (
              <FilterChip
                key={`m-${m}`}
                label={shortMinistry(m)}
                onRemove={() =>
                  setFilters((f) => ({ ...f, ministry: f.ministry.filter((x) => x !== m) }))
                }
              />
            ))}
            {filters.status.map((s) => (
              <FilterChip
                key={`s-${s}`}
                label={s}
                onRemove={() =>
                  setFilters((f) => ({ ...f, status: f.status.filter((x) => x !== s) }))
                }
              />
            ))}
            {filters.year !== "All" && (
              <FilterChip
                label={`Year ${filters.year}`}
                onRemove={() => setFilters((f) => ({ ...f, year: "All" }))}
              />
            )}
            <button
              onClick={() => {
                setFilters(EMPTY_FILTERS);
                setSearchInput("");
                setSearch("");
              }}
              className="ml-1 text-xs font-medium text-primary hover:underline inline-flex items-center gap-1 transition-colors"
            >
              <X className="h-3 w-3" />
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : members.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
          {isActiveSearch || activeFilterCount > 0
            ? "No members match the current search or filters."
            : "No members found."}
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card shadow-sm overflow-hidden">
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 border-b border-border">
                <tr className="text-left">
                  <th className="px-4 py-3 w-10">
                    <label className="inline-flex items-center justify-center">
                      <input
                        type="checkbox"
                        checked={allOnPageSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = !allOnPageSelected && someOnPageSelected;
                        }}
                        onChange={togglePage}
                        className="h-4 w-4 rounded border-input text-primary focus:ring-ring cursor-pointer"
                        aria-label="Select all on page"
                      />
                    </label>
                  </th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Name</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Parish</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Ministries</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">UID</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Status</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {members.map((m) => {
                  const checked = selected.has(m.id);
                  return (
                    <tr
                      key={m.id}
                      className={`transition-colors duration-150 hover:bg-muted/30 ${checked ? "bg-primary/5" : ""}`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleOne(m.id)}
                          className="h-4 w-4 rounded border-input text-primary focus:ring-ring cursor-pointer"
                          aria-label={`Select ${m.first_name} ${m.last_name}`}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => {
                            setDrawerMemberId(m.id);
                            setDrawerOpen(true);
                          }}
                          className="font-medium hover:text-primary text-left"
                        >
                          {m.first_name} {m.last_name}
                        </button>
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
                        <StatusBadge status={m.status} showIcon={false} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              className="inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                              aria-label={`Actions for ${m.first_name} ${m.last_name}`}
                            >
                              <MoreVertical className="h-4 w-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem onSelect={() => openEdit(m)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Correct name / parish
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onSelect={() => setDeleteTarget(m)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete record
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <p className="text-xs text-muted-foreground">
              Showing {page * PAGE_SIZE + 1}–
              {Math.min((page + 1) * PAGE_SIZE, totalCount)} of{" "}
              {totalCount.toLocaleString()}
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
      )}

      {/* Floating Action Bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 animate-in slide-in-from-bottom-4 duration-200">
          <div className="flex items-center gap-3 rounded-full border border-border bg-background/95 backdrop-blur px-4 py-2.5 shadow-lg ring-1 ring-black/5">
            <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              {selected.size} Member{selected.size > 1 ? "s" : ""} Selected
            </span>
            <div className="h-5 w-px bg-border" />
            <button
              onClick={exportCsv}
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
            >
              <Download className="h-4 w-4" />
              Export Data (CSV)
            </button>
            <button
              onClick={async () => {
                const ids = Array.from(selected);
                if (ids.length === 0) return;
                const { data } = await supabase
                  .from("members")
                  .select("*")
                  .in("id", ids);
                setReportMembers((data as Member[]) ?? []);
                setReportOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
            >
              <Printer className="h-4 w-4" />
              Print Selected
            </button>
            <div className="h-5 w-px bg-border" />
            <button
              onClick={clearSelection}
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
            >
              <X className="h-4 w-4" />
              Clear Selection
            </button>
          </div>
        </div>
      )}

      {/* Printable Report Modal */}
      {reportOpen && (
        <PrintReport
          members={reportMembers}
          onClose={() => setReportOpen(false)}
        />
      )}

      {/* Edit name / parish dialog */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Correct member details</DialogTitle>
            <DialogDescription>
              Fix spelling mistakes in the name or parish that would cause duplicate flags.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-first">First name</Label>
                <Input
                  id="edit-first"
                  value={editFirst}
                  onChange={(e) => setEditFirst(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-last">Last name</Label>
                <Input
                  id="edit-last"
                  value={editLast}
                  onChange={(e) => setEditLast(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-parish">Parish</Label>
              <Input
                id="edit-parish"
                value={editParish}
                onChange={(e) => setEditParish(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <button
              onClick={() => setEditTarget(null)}
              className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveEdit}
              disabled={savingEdit}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {savingEdit && <Loader2 className="h-4 w-4 animate-spin" />}
              Save changes
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this member record?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes {deleteTarget?.first_name} {deleteTarget?.last_name} ({deleteTarget?.uid}) and any linked recommendation letter. Use this only for records created by user error. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Delete record
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <MemberDetailDrawer
        memberId={drawerMemberId}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onUpdated={loadMembers}
      />
    </div>
  );
}

function FilterChip({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex max-w-[220px] items-center gap-1 rounded-full bg-primary/10 pl-2.5 pr-1.5 py-1 text-xs font-medium text-primary ring-1 ring-inset ring-primary/20 animate-in fade-in-0 zoom-in-95 duration-150">
      <span className="truncate">{label}</span>
      <button
        onClick={onRemove}
        className="rounded-full p-0.5 transition-colors hover:bg-primary/20"
        aria-label={`Remove ${label} filter`}
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

function FilterSelect({
  value,
  onChange,
  options,
  label,
  allLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  label: string;
  allLabel?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className="rounded-md border border-input bg-background px-2.5 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring truncate"
    >
      <option value="All">{allLabel ?? `All ${label}`}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function PrintReport({
  members,
  onClose,
}: {
  members: Member[];
  onClose: () => void;
}) {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const generatedAt = new Date().toLocaleString();

  const handlePrint = () => {
    const logoSrc = "/images/Asset_1.svg";
    const rowsHtml = members
      .map(
        (m, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${m.uid}</td>
          <td>${escapeHtml(`${m.first_name} ${m.last_name}`)}</td>
          <td>${escapeHtml(m.parish)}</td>
          <td>${escapeHtml(m.ministries.join(", "))}</td>
          <td>${escapeHtml(m.status)}</td>
        </tr>`
      )
      .join("");

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Liturgical Ministry Registry — Member Report</title>
  <style>
    @page { margin: 1.5cm; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1f2937; margin: 0; padding: 24px; }
    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #1e3a5f; padding-bottom: 12px; margin-bottom: 20px; }
    .header img { height: 56px; width: auto; }
    .header h1 { font-size: 16px; font-weight: 600; color: #1e3a5f; margin: 0; text-align: right; }
    .header .subtitle { font-size: 11px; color: #6b7280; text-align: right; margin-top: 2px; }
    .meta { font-size: 11px; color: #6b7280; margin-bottom: 16px; display: flex; justify-content: space-between; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    thead th { background: #1e3a5f; color: #fff; text-align: left; padding: 8px 10px; font-weight: 600; }
    tbody td { padding: 6px 10px; border-bottom: 1px solid #e5e7eb; }
    tbody tr:nth-child(even) { background: #f9fafb; }
    .footer { margin-top: 24px; font-size: 10px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 8px; text-align: center; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <div class="header">
    <img src="${logoSrc}" alt="Liturgical Ministry Registry" />
    <div>
      <h1>Official Member Report</h1>
      <div class="subtitle">Liturgical Ministry Registry</div>
    </div>
  </div>
  <div class="meta">
    <span><strong>Records:</strong> ${members.length}</span>
    <span><strong>Generated:</strong> ${generatedAt}</span>
  </div>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>UID</th>
        <th>Name</th>
        <th>Parish</th>
        <th>Ministries</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <div class="footer">
    This report was generated from the Liturgical Ministry Registry. For official use only.
  </div>
</body>
</html>`;

    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) {
      alert("Please allow pop-ups to generate the printable report.");
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-lg bg-background shadow-xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-3">
            <Image
              src="/images/Asset_1.svg"
              alt="Liturgical Ministry Registry"
              width={120}
              height={48}
              className="h-8 w-auto"
            />
            <span className="text-sm font-semibold">Printable Member Report</span>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 hover:bg-muted"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center justify-between px-5 py-2.5 bg-muted/40 border-b border-border">
          <span className="text-xs text-muted-foreground">
            {members.length} member(s) · Generated {generatedAt}
          </span>
          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Printer className="h-4 w-4" />
            Print Report
          </button>
        </div>

        <div className="overflow-auto scrollbar-thin p-5">
          {members.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              No members to print.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-border">
                  <th className="py-2 pr-2 font-semibold text-muted-foreground">#</th>
                  <th className="py-2 pr-2 font-semibold text-muted-foreground">UID</th>
                  <th className="py-2 pr-2 font-semibold text-muted-foreground">Name</th>
                  <th className="py-2 pr-2 font-semibold text-muted-foreground">Parish</th>
                  <th className="py-2 pr-2 font-semibold text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {members.map((m, i) => (
                  <tr key={m.id} className="hover:bg-muted/30">
                    <td className="py-2 pr-2 text-muted-foreground">{i + 1}</td>
                    <td className="py-2 pr-2">
                      <code className="text-xs">{m.uid}</code>
                    </td>
                    <td className="py-2 pr-2 font-medium">
                      {m.first_name} {m.last_name}
                    </td>
                    <td className="py-2 pr-2 text-muted-foreground">{m.parish}</td>
                    <td className="py-2 pr-2">
                      <StatusBadge status={m.status} showIcon={false} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
