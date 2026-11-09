"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { secureMinistryVerificationEnabled } from "@/lib/secure-ministry-verification";
import { CenteredAdminLoader } from "@/components/admin-centered-loader";
import { StatusBadge } from "@/components/status-badge";
import { MemberDetailDrawer } from "@/components/member-detail-drawer";
import { BulkCertificateDialog } from "@/components/member-bulk-certificate-dialog";
import {
  MINISTRIES,
  PARISHES,
  STATUS_VALUES,
  shortMinistry,
  getExpirationStatus,
} from "@/lib/constants";
import type { Member, MemberMinistry } from "@/lib/types";
import {
  Loader2,
  Search,
  UserPlus,
  ChevronLeft,
  ChevronRight,
  Download,
  Printer,
  FileBadge,
  X,
  Filter,
  SlidersHorizontal,
  MoreVertical,
  Pencil,
  Trash2,
  Eye,
  CircleAlert,
} from "@/components/phosphor-icons";
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
import { ebGaramond } from "@/app/fonts";
import { memberSearchExpression } from "@/lib/member-search";

const PAGE_SIZE = 20;

type Filters = {
  parish: string[];
  ministry: string[];
  year: string;
  status: string[];
};

type MemberWithMemberships = Member & {
  member_ministries: MemberMinistry[];
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

  const [members, setMembers] = useState<MemberWithMemberships[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectingAllFiltered, setSelectingAllFiltered] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const [certificateBatchOpen, setCertificateBatchOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportMembers, setReportMembers] = useState<MemberWithMemberships[]>([]);
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const [attendanceMembers, setAttendanceMembers] = useState<MemberWithMemberships[]>([]);
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const [attention, setAttention] = useState<"pending" | "missing-documents" | "expiring" | null>(null);

  // Read dashboard attention filter from the URL
  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("attention");
    if (value === "pending" || value === "missing-documents" || value === "expiring") {
      setAttention(value);
    }
  }, []);

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

  // Server-side search and filtering.
  // Ministry/status/attention filters now operate on member_ministries rather
  // than the legacy member-wide compatibility fields.
  const loadMembers = useCallback(async () => {
    setLoading(true);

    const dashboardAttention = new URLSearchParams(window.location.search).get("attention");
    const hasMembershipFilter =
      filters.ministry.length > 0 ||
      filters.status.length > 0 ||
      dashboardAttention === "pending" ||
      dashboardAttention === "missing-documents" ||
      dashboardAttention === "expiring";

    const membershipFields =
      "id,member_id,ministry,status,start_date,expiration_date,renewal_date,document_url,document_uploaded_at,archived_documents,created_at,updated_at";

    // Keep one unfiltered embedding for display, and use a second inner-join
    // alias only when membership-level filtering is required. This lets the
    // table show every ministry even when one specific ministry/status matched.
    const selectClause = hasMembershipFilter
      ? `*,member_ministries(${membershipFields}),matched_memberships:member_ministries!inner(id,ministry,status,expiration_date,document_url)`
      : `*,member_ministries(${membershipFields})`;

    let query = supabase
      .from("members")
      .select(selectClause, { count: "exact" });

    // Apply search filter (server-side, case-insensitive)
    const searchClause = memberSearchExpression(search);
    if (searchClause) {
      query = query.or(searchClause);
    }

    // Apply parish filter (member matches ANY selected parish)
    if (filters.parish.length > 0) {
      query = query.in("parish", filters.parish);
    }

    // Apply ministry filter to the per-ministry relationship.
    if (filters.ministry.length > 0) {
      query = query.in("matched_memberships.ministry", filters.ministry);
    }

    // Apply year filter (UID starts with LMD-YYYY-)
    if (filters.year && filters.year !== "All") {
      query = query.ilike("uid", `LMD-${filters.year}-%`);
    }

    // Dashboard attention filters now refer to individual ministry records.
    if (dashboardAttention === "pending") {
      query = query.eq("matched_memberships.status", "Pending Verification");
    }

    if (dashboardAttention === "missing-documents") {
      query = query.is("matched_memberships.document_url", null);
    }

    if (dashboardAttention === "expiring") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const future = new Date(today);
      future.setDate(future.getDate() + 30);

      query = query
        .not("matched_memberships.document_url", "is", null)
        .not("matched_memberships.expiration_date", "is", null)
        .gte("matched_memberships.expiration_date", today.toISOString().slice(0, 10))
        .lte("matched_memberships.expiration_date", future.toISOString().slice(0, 10));
    }

    // Apply status filter to the per-ministry relationship.
    if (filters.status.length > 0) {
      query = query.in("matched_memberships.status", filters.status);
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
      const normalized = ((data ?? []) as unknown as Array<
        MemberWithMemberships & { matched_memberships?: unknown }
      >).map(({ matched_memberships: _matchedMemberships, ...member }) => ({
        ...member,
        member_ministries: [...(member.member_ministries ?? [])].sort((a, b) =>
          a.ministry.localeCompare(b.ministry)
        ),
      }));

      setMembers(normalized);
      setTotalCount(count ?? 0);
    }

    setLoading(false);
  }, [supabase, search, filters, page, toast, attention]);

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

  const parishOptions = [...PARISHES].sort((a, b) => a.localeCompare(b));

  const buildFilteredMembersQuery = useCallback(
    (mode: "ids" | "full") => {
      const dashboardAttention = new URLSearchParams(window.location.search).get(
        "attention"
      );
      const hasMembershipFilter =
        filters.ministry.length > 0 ||
        filters.status.length > 0 ||
        dashboardAttention === "pending" ||
        dashboardAttention === "missing-documents" ||
        dashboardAttention === "expiring";

      const membershipFields =
        "id,member_id,ministry,status,start_date,expiration_date,renewal_date,document_url,document_uploaded_at,archived_documents,created_at,updated_at";

      const selectClause =
        mode === "full"
          ? hasMembershipFilter
            ? `*,member_ministries(${membershipFields}),matched_memberships:member_ministries!inner(id,ministry,status,expiration_date,document_url)`
            : `*,member_ministries(${membershipFields})`
          : hasMembershipFilter
            ? `id,matched_memberships:member_ministries!inner(id,ministry,status,expiration_date,document_url)`
            : "id";

      let query = supabase.from("members").select(selectClause);

      const searchClause = memberSearchExpression(search);
    if (searchClause) {
      query = query.or(searchClause);
    }

      if (filters.parish.length > 0) {
        query = query.in("parish", filters.parish);
      }

      if (filters.ministry.length > 0) {
        query = query.in("matched_memberships.ministry", filters.ministry);
      }

      if (filters.year && filters.year !== "All") {
        query = query.ilike("uid", `LMD-${filters.year}-%`);
      }

      if (dashboardAttention === "pending") {
        query = query.eq("matched_memberships.status", "Pending Verification");
      }

      if (dashboardAttention === "missing-documents") {
        query = query.is("matched_memberships.document_url", null);
      }

      if (dashboardAttention === "expiring") {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const future = new Date(today);
        future.setDate(future.getDate() + 30);

        query = query
          .not("matched_memberships.document_url", "is", null)
          .not("matched_memberships.expiration_date", "is", null)
          .gte(
            "matched_memberships.expiration_date",
            today.toISOString().slice(0, 10)
          )
          .lte(
            "matched_memberships.expiration_date",
            future.toISOString().slice(0, 10)
          );
      }

      if (filters.status.length > 0) {
        query = query.in("matched_memberships.status", filters.status);
      }

      return query;
    },
    [supabase, search, filters, attention]
  );

  const fetchAllFilteredMemberIds = useCallback(async (): Promise<string[]> => {
    const ids: string[] = [];
    const pageSize = 1000;

    for (let from = 0; ; from += pageSize) {
      const { data, error } = await buildFilteredMembersQuery("ids")
        .range(from, from + pageSize - 1)
        .order("created_at", { ascending: false });

      if (error) throw new Error(error.message);

      const batch = ((data ?? []) as unknown as Array<{ id: string }>).map(
        (row) => row.id
      );
      ids.push(...batch);

      if (batch.length < pageSize) break;
    }

    return Array.from(new Set(ids));
  }, [buildFilteredMembersQuery]);

  const fetchAllFilteredMembers = useCallback(
    async (): Promise<MemberWithMemberships[]> => {
      const all: MemberWithMemberships[] = [];
      const pageSize = 1000;

      for (let from = 0; ; from += pageSize) {
        const { data, error } = await buildFilteredMembersQuery("full")
          .range(from, from + pageSize - 1)
          .order("created_at", { ascending: false });

        if (error) throw new Error(error.message);

        const batch = ((data ?? []) as unknown as Array<
          MemberWithMemberships & { matched_memberships?: unknown }
        >).map(({ matched_memberships: _matchedMemberships, ...member }) => ({
          ...member,
          member_ministries: [...(member.member_ministries ?? [])].sort((a, b) =>
            a.ministry.localeCompare(b.ministry)
          ),
        }));

        all.push(...batch);
        if (batch.length < pageSize) break;
      }

      return all;
    },
    [buildFilteredMembersQuery]
  );

  const fetchMembersByIds = useCallback(
    async (ids: string[]): Promise<MemberWithMemberships[]> => {
      const all: MemberWithMemberships[] = [];
      const chunkSize = 500;

      for (let index = 0; index < ids.length; index += chunkSize) {
        const chunk = ids.slice(index, index + chunkSize);
        const { data, error } = await supabase
          .from("members")
          .select("*,member_ministries(*)")
          .in("id", chunk);

        if (error) throw new Error(error.message);
        all.push(...(((data ?? []) as MemberWithMemberships[]) ?? []));
      }

      const position = new Map(ids.map((id, index) => [id, index]));
      return all.sort(
        (a, b) =>
          (position.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
          (position.get(b.id) ?? Number.MAX_SAFE_INTEGER)
      );
    },
    [supabase]
  );

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

  const selectAllFiltered = async () => {
    setSelectingAllFiltered(true);
    try {
      const ids = await fetchAllFilteredMemberIds();
      setSelected(new Set(ids));
      toast({
        title: "All matching members selected",
        description: `${ids.length.toLocaleString()} member(s) across all pages are selected.`,
      });
    } catch (error) {
      toast({
        title: "Selection failed",
        description:
          error instanceof Error
            ? error.message
            : "Unable to select all filtered members.",
        variant: "destructive",
      });
    } finally {
      setSelectingAllFiltered(false);
    }
  };

  useEffect(() => {
    setSelected(new Set());
  }, [search, filters, attention]);

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

    let membersToExport: MemberWithMemberships[] = [];
    try {
      membersToExport = await fetchMembersByIds(selectedList);
    } catch (error) {
      toast({
        title: "Export failed",
        description:
          error instanceof Error ? error.message : "Unable to load selected members.",
        variant: "destructive",
      });
      return;
    }
    const rows = membersToExport.map((m) =>
      [
        escape(m.uid),
        escape(m.first_name),
        escape(m.last_name),
        escape(m.parish),
        escape((m.member_ministries ?? []).map((membership) => membership.ministry).join("; ")),
        escape(
          (m.member_ministries ?? [])
            .map((membership) => `${shortMinistry(membership.ministry)}: ${membership.status}`)
            .join("; ")
        ),
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

  const openAttendanceSheetForSelected = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) {
      toast({
        title: "No members selected",
        description: "Select the members to include in the attendance sheet.",
        variant: "destructive",
      });
      return;
    }

    setLoadingReport(true);
    try {
      const selectedMembers = await fetchMembersByIds(ids);
      setAttendanceMembers(selectedMembers);
      setAttendanceOpen(true);
    } catch (error) {
      toast({
        title: "Attendance sheet failed",
        description:
          error instanceof Error
            ? error.message
            : "Unable to load selected members.",
        variant: "destructive",
      });
    } finally {
      setLoadingReport(false);
    }
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
    if (secureMinistryVerificationEnabled) {
      toast({ title: "Secure mode", description: "Legacy direct member editing is paused until an authorized database RPC is available.", variant: "destructive" });
      return;
    }
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
      description: `${editTarget.first_name} ${editTarget.last_name} -> ${first} ${last}.`,
    });
    setEditTarget(null);
    loadMembers();
  };

  // --- Delete a record created by user error ---
  const handleDelete = async () => {
    if (!deleteTarget) return;
    if (secureMinistryVerificationEnabled) {
      toast({ title: "Secure mode", description: "Legacy member deletion is paused. Use an audited administrator procedure.", variant: "destructive" });
      return;
    }
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
    <div className="space-y-5 pb-28 text-[#1E1114]">
      {attention && (
        <div className="flex items-center justify-between gap-3 border border-primary/20 bg-primary/5 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold">
              {attention === "pending" && "Pending Verification"}
              {attention === "missing-documents" && "Recommendation Letter Needed"}
              {attention === "expiring" && "Expiring Soon"}
            </p>
            <p className="text-xs text-muted-foreground">
              {attention === "pending" &&
                "Members currently waiting for approval."}
              {attention === "missing-documents" &&
                "Members who still need a recommendation letter uploaded."}
              {attention === "expiring" &&
                "Members whose recommendation letters expire within 30 days."}
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setAttention(null);
              window.history.replaceState({}, "", "/admin/members");
              setPage(0);
            }}
            className="shrink-0 rounded-md px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
          >
            Clear
          </button>
        </div>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#890022]">RECORD MANAGEMENT</p>
          <h1 className={`${ebGaramond.className} mt-1 text-[42px] font-medium leading-none text-[#1E1114] sm:text-[48px]`}>Member Records</h1>
          <p className="mt-2 text-sm leading-6 text-[#6B5C62]">
            Manage registered liturgical ministers, parish assignments, and ministry records.
            <span className="block pt-1 text-xs font-medium text-[#66565A]">
              {loading ? "Loading members…" : `${totalCount.toLocaleString()} matching member${totalCount === 1 ? "" : "s"}`}
              {selected.size > 0 && ` · ${selected.size.toLocaleString()} selected`}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={async () => {
              setLoadingReport(true);
              try {
                const filteredMembers = await fetchAllFilteredMembers();
                setReportMembers(filteredMembers);
                setReportOpen(true);
              } catch (error) {
                toast({
                  title: "Report failed",
                  description:
                    error instanceof Error
                      ? error.message
                      : "Unable to load the filtered member list.",
                  variant: "destructive",
                });
              } finally {
                setLoadingReport(false);
              }
            }}
            disabled={loadingReport}
            className="inline-flex min-h-10 items-center gap-2 border border-[#D7CACC] bg-white px-4 py-2 text-sm font-semibold text-[#682336] transition-colors hover:bg-[#fcf5f6] print:hidden disabled:opacity-60"
          >
            {loadingReport ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Printer className="h-4 w-4" />
            )}
            Print List
          </button>
          <Link
            href="/admin/members/add"
            className="inline-flex min-h-10 items-center gap-2 bg-[#890022] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#6d1027] print:hidden"
          >
            <UserPlus className="h-4 w-4" />
            Add Member
          </Link>
        </div>
      </div>

      {/* Filter bar: keep the existing server-side search and filter behavior. */}
      <section aria-label="Search and filter members" className="overflow-hidden border border-[#E6DADC] border-t-[3px] border-t-[#890022] bg-white">
        <div className="border-b border-[#E6DADC] px-4 py-3 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[#1E1114]">
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
              <h2 className="text-sm font-semibold">Search &amp; Filters</h2>
            </div>
            <span className="text-xs text-muted-foreground">Filter by parish, ministry, service year, or status</span>
          </div>
        </div>
        <div className="space-y-3 p-4 sm:p-5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name, parish, or UID..."
            className="w-full border border-[#D7CACC] bg-white py-2.5 pl-10 pr-3 text-sm transition-[border-color,box-shadow] placeholder:text-[#8c8185] focus-visible:border-[#9b4560] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9b4560]/20"
          />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <MultiSelectCombobox
            options={parishOptions}
            selected={filters.parish}
            onChange={(v) => setFilters((f) => ({ ...f, parish: v }))}
            placeholder="All Parishes"
            searchPlaceholder="Type a parish name..."
            emptyText="No parish matches."
            formatBadge={(v) => (v.length > 18 ? `${v.slice(0, 16)}...` : v)}
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
      </section>

      {/* Table */}
      {loading ? (
        <CenteredAdminLoader label="Loading member records…" />
      ) : members.length === 0 ? (
        <div className="border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
          {isActiveSearch || activeFilterCount > 0
            ? "No members match the current search or filters."
            : "No members found."}
        </div>
      ) : (
        <section aria-label="Member records" className="overflow-hidden border border-[#E6DADC] border-t-[3px] border-t-[#890022] bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E6DADC] px-4 py-3 sm:px-5">
            <div>
              <h2 className="text-[14px] font-semibold text-[#27191D]">Registered Ministers</h2>
              <p className="text-xs text-muted-foreground">Select records for export, printable lists, or attendance sheets.</p>
            </div>
            <span className="bg-[#F7F2F3] px-3 py-1 text-xs font-semibold text-[#890022]">{totalCount.toLocaleString()} records</span>
          </div>
          <div className="overflow-x-auto overflow-y-hidden touch-pan-x scrollbar-thin">
            <table className="w-full min-w-[950px] text-sm">
              <thead className="border-b border-[#E6DADC] bg-[#FBF9F9]">
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
                  <th className="px-4 py-3.5 text-xs font-semibold text-[#66565A]">Name</th>
                  <th className="px-4 py-3.5 text-xs font-semibold text-[#66565A]">Parish</th>
                  <th className="px-4 py-3.5 text-xs font-semibold text-[#66565A]">Ministries</th>
                  <th className="px-4 py-3.5 text-xs font-semibold text-[#66565A]">UID</th>
                  <th className="px-4 py-3.5 text-xs font-semibold text-[#66565A]">Ministry Status</th>
                  <th className="px-4 py-3.5 text-right text-xs font-semibold text-[#66565A]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {members.map((m) => {
                  const checked = selected.has(m.id);
                  const memberships = m.member_ministries ?? [];
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  const in30Days = new Date(today);
                  in30Days.setDate(in30Days.getDate() + 30);

                  const needsVerification = memberships.some(
                    (membership) => membership.status === "Pending Verification"
                  );
                  const missingLetterMinistries = memberships
                    .filter((membership) => !membership.document_url)
                    .map((membership) => shortMinistry(membership.ministry));
                  const needsLetter = missingLetterMinistries.length > 0;
                  // Legacy documents are stored at member level, not linked to
                  // individual assignments. Don't present this as proof that
                  // a new letter must be uploaded or suppress the warning.
                  const letterWarning = needsLetter
                    ? m.document_url
                      ? `Ministry letter not linked: ${missingLetterMinistries.join(", ")} (older member-level letter exists; review coverage before linking)`
                      : `Ministry recommendation letter missing: ${missingLetterMinistries.join(", ")}`
                    : null;
                  const registrationExpiringSoon = memberships.some((membership) => {
                    if (!membership.document_url || !membership.expiration_date) return false;
                    const expirationDate = new Date(`${membership.expiration_date}T00:00:00`);
                    return expirationDate >= today && expirationDate <= in30Days;
                  });
                  return (
                    <tr
                      key={m.id}
                      className={`transition-colors duration-150 hover:bg-[#fcf7f8] ${checked ? "bg-[#fbf0f3]" : ""}`}
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
                          className="text-left font-semibold text-[#47242d] hover:text-[#9a2548] hover:underline"
                        >
                          {m.first_name} {m.last_name}
                        {(needsVerification || needsLetter || registrationExpiringSoon) && (
                          <span
                            className="ml-2 inline-flex align-middle text-amber-600"
                            title={[
                              needsVerification ? "Verification Needed" : null,
                              letterWarning,
                              registrationExpiringSoon ? "Registration Expiring Soon" : null,
                            ].filter(Boolean).join(" - ")}
                            aria-label={[
                              needsVerification ? "Verification Needed" : null,
                              letterWarning,
                              registrationExpiringSoon ? "Registration Expiring Soon" : null,
                            ].filter(Boolean).join(", ")}
                          >
                            <CircleAlert className="h-4 w-4" aria-hidden="true" />
                          </span>
                        )}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{m.parish}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {memberships.map((membership) => (
                            <span
                              key={membership.id}
                              className="inline-flex rounded-md border border-[#e7dce0] bg-[#f9f5f6] px-2 py-1 text-[11px] font-medium text-[#673e4b]"
                            >
                              {shortMinistry(membership.ministry)}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <code className="text-xs text-muted-foreground">{m.uid}</code>
                      </td>
                      <td className="px-4 py-3">
                        <div className="space-y-1.5">
                          {memberships.length === 0 ? (
                            <span className="text-xs text-muted-foreground">
                              No ministry records
                            </span>
                          ) : (
                            memberships.map((membership) => {
                              const expirationLabel = membership.expiration_date
                                ? new Date(
                                    `${membership.expiration_date}T00:00:00`
                                  ).toLocaleDateString()
                                : null;
                              const expirationStatus = getExpirationStatus(
                                membership.expiration_date
                              );

                              return (
                                <div
                                  key={membership.id}
                                  className="flex flex-wrap items-center gap-1.5"
                                >
                                  <span className="min-w-[3rem] text-[11px] font-semibold text-muted-foreground">
                                    {shortMinistry(membership.ministry)}
                                  </span>
                                  <StatusBadge
                                    status={membership.status}
                                    showIcon={false}
                                  />
                                  {expirationStatus === "expired" && (
                                    <span className="inline-flex rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700 ring-1 ring-inset ring-rose-600/20">
                                      Expired
                                    </span>
                                  )}
                                  {expirationStatus === "expiring_soon" && (
                                    <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-inset ring-amber-600/20">
                                      Expiring Soon
                                    </span>
                                  )}
                                  {expirationLabel && (
                                    <span className="text-[11px] text-muted-foreground">
                                      until {expirationLabel}
                                    </span>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
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
              Showing {page * PAGE_SIZE + 1}-
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
        </section>
      )}

      {allOnPageSelected &&
        totalCount > pageMemberIds.length &&
        selected.size < totalCount && (
          <div className="border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-muted-foreground">
                All {pageMemberIds.length.toLocaleString()} members on this page are selected.
              </p>
              <button
                type="button"
                onClick={() => void selectAllFiltered()}
                disabled={selectingAllFiltered}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                {selectingAllFiltered && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                )}
                Select all {totalCount.toLocaleString()} matching members
              </button>
            </div>
          </div>
        )}

      {selected.size === totalCount && totalCount > PAGE_SIZE && (
        <div className="border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          All {totalCount.toLocaleString()} matching members across every page are selected.
        </div>
      )}

      {/* Floating Action Bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-3 left-2 right-2 z-40 animate-in slide-in-from-bottom-4 duration-200 sm:bottom-6 sm:left-1/2 sm:right-auto sm:-translate-x-1/2">
          <div className="flex max-w-full items-center gap-2 overflow-x-auto border border-[#69001A] bg-[#890022] px-3 py-3 text-white shadow-lg sm:gap-3 sm:px-5">
            <span className="inline-flex items-center gap-2 shrink-0 bg-white/15 px-3 py-1 text-sm font-semibold text-white">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              {selected.size} Member{selected.size > 1 ? "s" : ""} Selected
            </span>
            <div className="h-5 w-px shrink-0 bg-white/30" />
            <button
              onClick={exportCsv}
              className="inline-flex items-center gap-1.5 shrink-0 border border-white bg-white px-3 py-2 text-sm font-medium text-[#890022] hover:bg-[#F7F2F3] transition-colors"
            >
              <Download className="h-4 w-4" />
              Export Data (CSV)
            </button>
            <button
              onClick={async () => {
                const ids = Array.from(selected);
                if (ids.length === 0) return;

                setLoadingReport(true);
                try {
                  const selectedMembers = await fetchMembersByIds(ids);
                  setReportMembers(selectedMembers);
                  setReportOpen(true);
                } catch (error) {
                  toast({
                    title: "Report failed",
                    description:
                      error instanceof Error
                        ? error.message
                        : "Unable to load selected members.",
                    variant: "destructive",
                  });
                } finally {
                  setLoadingReport(false);
                }
              }}
              disabled={loadingReport}
              className="inline-flex items-center gap-1.5 shrink-0 border border-white bg-white px-3 py-2 text-sm font-medium text-[#890022] hover:bg-[#F7F2F3] transition-colors disabled:opacity-60"
            >
              {loadingReport ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Printer className="h-4 w-4" />
              )}
              Print Selected
            </button>
            <button
              type="button"
              onClick={() => setCertificateBatchOpen(true)}
              disabled={filters.ministry.length === 0}
              title={filters.ministry.length === 0
                ? "Select at least one ministry in Search & Filters to print only its eligible certificates."
                : "Generate one PDF for eligible certificates in the selected ministry filter."}
              className="inline-flex shrink-0 items-center gap-1.5 border border-white bg-white px-3 py-2 text-sm font-medium text-[#890022] transition-colors hover:bg-[#F7F2F3] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FileBadge className="h-4 w-4" />
              Certificate PDF
            </button>
            <button
              onClick={() => void openAttendanceSheetForSelected()}
              disabled={loadingReport}
              className="inline-flex items-center gap-1.5 shrink-0 border border-white bg-white px-3 py-2 text-sm font-medium text-[#890022] hover:bg-[#F7F2F3] transition-colors disabled:opacity-60"
            >
              <Printer className="h-4 w-4" />
              Attendance Sheet
            </button>
            <div className="h-5 w-px shrink-0 bg-white/30" />
            <button
              onClick={clearSelection}
              className="inline-flex items-center gap-1.5 shrink-0 border border-white/60 px-3 py-2 text-sm font-medium text-white hover:bg-white/15 transition-colors"
            >
              <X className="h-4 w-4" />
              Clear Selection
            </button>
          </div>
        </div>
      )}

      <BulkCertificateDialog
        open={certificateBatchOpen}
        onOpenChange={setCertificateBatchOpen}
        selectedMemberIds={Array.from(selected)}
        selectedMinistries={filters.ministry}
        loadMembers={fetchMembersByIds}
      />

      {/* Printable Report Modal */}
      {reportOpen && (
        <PrintReport
          members={reportMembers}
          onClose={() => setReportOpen(false)}
        />
      )}

      {attendanceOpen && (
        <AttendanceSheet
          members={attendanceMembers}
          selectedMinistries={filters.ministry}
          onClose={() => setAttendanceOpen(false)}
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

function sortMembersAlphabetically(
  members: MemberWithMemberships[]
): MemberWithMemberships[] {
  return [...members].sort((a, b) => {
    const lastNameCompare = a.last_name.localeCompare(b.last_name, undefined, {
      sensitivity: "base",
    });
    if (lastNameCompare !== 0) return lastNameCompare;

    const firstNameCompare = a.first_name.localeCompare(b.first_name, undefined, {
      sensitivity: "base",
    });
    if (firstNameCompare !== 0) return firstNameCompare;

    return a.uid.localeCompare(b.uid, undefined, { sensitivity: "base" });
  });
}

function getPrintThemeColors(): {
  primary: string;
  primaryForeground: string;
} {
  if (typeof document === "undefined") {
    return {
      primary: "rgb(220, 38, 38)",
      primaryForeground: "rgb(255, 255, 255)",
    };
  }

  const probe = document.createElement("div");
  probe.className = "bg-primary text-primary-foreground";
  probe.style.position = "fixed";
  probe.style.pointerEvents = "none";
  probe.style.opacity = "0";
  document.body.appendChild(probe);

  const computed = window.getComputedStyle(probe);
  const primary = computed.backgroundColor || "rgb(220, 38, 38)";
  const primaryForeground = computed.color || "rgb(255, 255, 255)";

  probe.remove();

  return { primary, primaryForeground };
}

function PrintReport({
  members,
  onClose,
}: {
  members: MemberWithMemberships[];
  onClose: () => void;
}) {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const generatedAt = new Date().toLocaleString();
  const alphabetizedMembers = sortMembersAlphabetically(members);

  const handlePrint = () => {
    const logoSrc = "/images/Asset_1.svg";
    const { primary, primaryForeground } = getPrintThemeColors();
    const rowsPerPage = 22;
    const totalPages = Math.max(1, Math.ceil(alphabetizedMembers.length / rowsPerPage));

    const parishNames = Array.from(
      new Set(alphabetizedMembers.map((member) => member.parish).filter(Boolean))
    );
    const ministryNames = Array.from(
      new Set(
        alphabetizedMembers.flatMap((member) =>
          (member.member_ministries ?? []).map((membership) => membership.ministry)
        )
      )
    );

    const reportScope =
      parishNames.length === 1
        ? parishNames[0]
        : parishNames.length > 1
          ? `${parishNames.length} parishes / mission stations`
          : "Member registry";

    const ministryScope =
      ministryNames.length === 1
        ? ministryNames[0]
        : ministryNames.length > 1
          ? `${ministryNames.length} ministries represented`
          : "No ministry assignment";

    const pagesHtml = Array.from({ length: totalPages }, (_, pageIndex) => {
      const startIndex = pageIndex * rowsPerPage;
      const pageMembers = alphabetizedMembers.slice(startIndex, startIndex + rowsPerPage);

      const rowsHtml = pageMembers
        .map(
          (m, rowIndex) => `
          <tr>
            <td class="row-number">${startIndex + rowIndex + 1}</td>
            <td class="uid">${escapeHtml(m.uid)}</td>
            <td class="member-name">${escapeHtml(`${m.last_name}, ${m.first_name}`)}</td>
            <td>${escapeHtml(m.parish)}</td>
            <td>${escapeHtml(
              (m.member_ministries ?? [])
                .map((membership) => membership.ministry)
                .join(", ")
            )}</td>
            <td>${escapeHtml(
              (m.member_ministries ?? [])
                .map(
                  (membership) =>
                    `${shortMinistry(membership.ministry)}: ${membership.status}`
                )
                .join("; ")
            )}</td>
          </tr>`
        )
        .join("");

      return `
        <section class="report-page">
          <header class="report-header">
            <img src="${logoSrc}" alt="Liturgical Ministry Registry" />
            <div class="report-heading">
              <div class="eyebrow">Liturgical Ministry Registry</div>
              <h1>Official Member Report</h1>
              <div class="scope">${escapeHtml(reportScope)}</div>
            </div>
          </header>

          <div class="report-meta">
            <div>
              <span class="meta-label">Scope</span>
              <strong>${escapeHtml(reportScope)}</strong>
            </div>
            <div>
              <span class="meta-label">Ministry</span>
              <strong>${escapeHtml(ministryScope)}</strong>
            </div>
            <div>
              <span class="meta-label">Records</span>
              <strong>${alphabetizedMembers.length}</strong>
            </div>
            <div>
              <span class="meta-label">Generated</span>
              <strong>${escapeHtml(generatedAt)}</strong>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th class="col-number">#</th>
                <th class="col-name">Name</th>
                <th class="col-parish">Parish</th>
                <th class="col-ministry">Ministries</th>
                <th class="col-status">Status</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>

          <footer class="report-footer">
            <span>Generated by Liturgical Ministry Registry · For official use only</span>
            <span>Page ${pageIndex + 1} of ${totalPages}</span>
          </footer>
        </section>`;
    }).join("");

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Liturgical Ministry Registry — Member Report</title>
  <style>
    :root {
      color-scheme: light;
      --print-primary: ${primary};
      --print-primary-foreground: ${primaryForeground};
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #1f2937;
      background: #ffffff;
    }

    * { box-sizing: border-box; }

    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
    }

    body {
      padding: 20px;
    }

    .report-page {
      width: 100%;
      min-height: 25.7cm;
      display: flex;
      flex-direction: column;
      background: #ffffff;
    }

    .report-page + .report-page {
      margin-top: 28px;
      padding-top: 4px;
      border-top: 1px dashed #d1d5db;
    }

    .report-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 24px;
      border-bottom: 2px solid var(--print-primary);
      padding-bottom: 10px;
      margin-bottom: 12px;
    }

    .report-header img {
      height: 50px;
      width: auto;
      object-fit: contain;
    }

    .report-heading {
      text-align: right;
      min-width: 0;
    }

    .eyebrow {
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #64748b;
    }

    .report-heading h1 {
      margin: 2px 0 0;
      font-size: 17px;
      line-height: 1.2;
      font-weight: 700;
      color: var(--print-primary);
    }

    .scope {
      margin-top: 3px;
      font-size: 10px;
      color: #64748b;
    }

    .report-meta {
      display: grid;
      grid-template-columns: 1.4fr 1.4fr 0.55fr 1fr;
      gap: 8px;
      margin-bottom: 12px;
      padding: 8px 10px;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      background: #f8fafc;
      font-size: 9px;
    }

    .report-meta > div {
      min-width: 0;
    }

    .meta-label {
      display: block;
      margin-bottom: 2px;
      font-size: 7.5px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #94a3b8;
    }

    .report-meta strong {
      display: block;
      overflow-wrap: anywhere;
      color: #334155;
      font-weight: 600;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 9.25px;
    }

    thead {
      display: table-header-group;
    }

    thead th {
      background: var(--print-primary);
      color: var(--print-primary-foreground);
      text-align: left;
      padding: 6px 7px;
      font-weight: 650;
      line-height: 1.2;
    }

    tbody tr {
      break-inside: avoid;
      page-break-inside: avoid;
    }

    tbody td {
      padding: 5px 7px;
      border-bottom: 1px solid #e5e7eb;
      vertical-align: top;
      line-height: 1.3;
      overflow-wrap: anywhere;
    }

    tbody tr:nth-child(even) {
      background: #f8fafc;
    }

    .row-number {
      color: #64748b;
      text-align: right;
    }

    .member-name {
      font-weight: 600;
      color: #0f172a;
    }

    .col-number { width: 4%; text-align: right; }
    .col-uid { width: 15%; }
    .col-name { width: 19%; }
    .col-parish { width: 21%; }
    .col-ministry { width: 21%; }
    .col-status { width: 20%; }

    .report-footer {
      margin-top: auto;
      padding-top: 8px;
      border-top: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      gap: 16px;
      font-size: 8px;
      color: #94a3b8;
    }

    @media print {
      @page {
        size: A4 portrait;
        margin: 1.15cm 1.2cm 1cm;
      }

      html, body {
        width: 100%;
        background: #ffffff !important;
      }

      body {
        padding: 0;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      .report-page {
        min-height: 27.55cm;
        break-after: page;
        page-break-after: always;
      }

      .report-page:last-child {
        break-after: auto;
        page-break-after: auto;
      }

      .report-page + .report-page {
        margin-top: 0;
        padding-top: 0;
        border-top: 0;
      }

      thead {
        display: table-header-group;
      }

      tfoot {
        display: table-footer-group;
      }
    }
  </style>
</head>
<body>
  ${pagesHtml}
</body>
</html>`;

    const w = window.open("", "_blank", "width=1000,height=800");
    if (!w) {
      alert("Please allow pop-ups to generate the printable report.");
      return;
    }

    w.document.open();
    w.document.write(html);
    w.document.close();

    try {
      w.document.title = "Liturgical Ministry Registry — Member Report";
      w.history.replaceState({}, "", "/admin/members/report");
    } catch {
      // The report still prints correctly if the browser does not allow
      // replacing the temporary print-window URL.
    }

    const printWhenReady = async () => {
      const images = Array.from(w.document.images);

      await Promise.all(
        images.map(
          (image) =>
            new Promise<void>((resolve) => {
              if (image.complete) {
                resolve();
                return;
              }

              image.addEventListener("load", () => resolve(), { once: true });
              image.addEventListener("error", () => resolve(), { once: true });
            })
        )
      );

      if (w.document.fonts?.ready) {
        await w.document.fonts.ready;
      }

      w.focus();
      w.print();
    };

    void printWhenReady();
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
            {alphabetizedMembers.length} member(s) - Generated {generatedAt}
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
          {alphabetizedMembers.length === 0 ? (
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
                {alphabetizedMembers.map((m, i) => (
                  <tr key={m.id} className="hover:bg-muted/30">
                    <td className="py-2 pr-2 text-muted-foreground">{i + 1}</td>
                    <td className="py-2 pr-2">
                      <code className="text-xs">{m.uid}</code>
                    </td>
                    <td className="py-2 pr-2 font-medium">
                      {m.last_name}, {m.first_name}
                    </td>
                    <td className="py-2 pr-2 text-muted-foreground">{m.parish}</td>
                    <td className="py-2 pr-2">
                      <div className="space-y-1">
                        {(m.member_ministries ?? []).map((membership) => (
                          <div key={membership.id} className="flex items-center gap-1.5">
                            <span className="text-[11px] text-muted-foreground">
                              {shortMinistry(membership.ministry)}
                            </span>
                            <StatusBadge status={membership.status} showIcon={false} />
                          </div>
                        ))}
                      </div>
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


function AttendanceSheet({
  members,
  selectedMinistries,
  onClose,
}: {
  members: MemberWithMemberships[];
  selectedMinistries: string[];
  onClose: () => void;
}) {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const alphabetizedMembers = sortMembersAlphabetically(members);

  const parishNames = Array.from(
    new Set(alphabetizedMembers.map((member) => member.parish).filter(Boolean))
  );

  const ministryNames = Array.from(
    new Set(
      alphabetizedMembers.flatMap((member) =>
        (member.member_ministries ?? []).map((membership) => membership.ministry)
      )
    )
  );

  const parishLabel =
    parishNames.length === 1
      ? parishNames[0]
      : parishNames.length > 1
        ? `${parishNames.length} parishes / mission stations`
        : "—";

  const ministryLabel =
    selectedMinistries.length === 1
      ? selectedMinistries[0]
      : selectedMinistries.length > 1
        ? selectedMinistries.join(", ")
        : ministryNames.length === 1
          ? ministryNames[0]
          : ministryNames.length > 1
            ? `${ministryNames.length} ministries represented`
            : "—";

  const generatedAt = new Date().toLocaleString();

  const handlePrint = () => {
    const logoSrc = "/images/Asset_1.svg";
    const { primary, primaryForeground } = getPrintThemeColors();
    const rowsPerPage = 25;
    const totalPages = Math.max(1, Math.ceil(alphabetizedMembers.length / rowsPerPage));

    const pagesHtml = Array.from({ length: totalPages }, (_, pageIndex) => {
      const startIndex = pageIndex * rowsPerPage;
      const pageMembers = alphabetizedMembers.slice(startIndex, startIndex + rowsPerPage);

      const rowsHtml = pageMembers
        .map(
          (member, rowIndex) => `
          <tr>
            <td class="row-number">${startIndex + rowIndex + 1}</td>
            <td class="member-name">${escapeHtml(`${member.last_name}, ${member.first_name}`)}</td>
            <td class="signature">&nbsp;</td>
            <td class="time">&nbsp;</td>
            <td class="time">&nbsp;</td>
          </tr>`
        )
        .join("");

      return `
        <section class="report-page">
          <header class="report-header">
            <img src="${logoSrc}" alt="Liturgical Ministry Registry" />
            <div class="report-heading">
              <div class="eyebrow">Liturgical Ministry Registry</div>
              <h1>Official Attendance Sheet</h1>
              <div class="scope">${escapeHtml(parishLabel)}</div>
            </div>
          </header>

          <div class="report-meta">
            <div>
              <span class="meta-label">Parish / Mission Station</span>
              <strong>${escapeHtml(parishLabel)}</strong>
            </div>
            <div>
              <span class="meta-label">Ministry</span>
              <strong>${escapeHtml(ministryLabel)}</strong>
            </div>
            <div>
              <span class="meta-label">Date / Activity</span>
              <strong class="write-line">&nbsp;</strong>
            </div>
            <div>
              <span class="meta-label">Records</span>
              <strong>${alphabetizedMembers.length}</strong>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th class="col-number">#</th>
                <th class="col-name">Name</th>
                <th class="col-signature">Signature</th>
                <th class="col-time">Time In</th>
                <th class="col-time">Time Out</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>

          <footer class="report-footer">
            <span>Generated by Liturgical Ministry Registry · For official use only</span>
            <span>Page ${pageIndex + 1} of ${totalPages}</span>
          </footer>
        </section>`;
    }).join("");

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Liturgical Ministry Registry — Attendance Sheet</title>
  <style>
    :root {
      color-scheme: light;
      --print-primary: ${primary};
      --print-primary-foreground: ${primaryForeground};
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #1f2937;
      background: #ffffff;
    }

    * { box-sizing: border-box; }

    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
    }

    body {
      padding: 20px;
    }

    .report-page {
      width: 100%;
      min-height: 25.7cm;
      display: flex;
      flex-direction: column;
      background: #ffffff;
    }

    .report-page + .report-page {
      margin-top: 28px;
      padding-top: 4px;
      border-top: 1px dashed #d1d5db;
    }

    .report-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 24px;
      border-bottom: 2px solid var(--print-primary);
      padding-bottom: 10px;
      margin-bottom: 12px;
    }

    .report-header img {
      height: 50px;
      width: auto;
      object-fit: contain;
    }

    .report-heading {
      text-align: right;
      min-width: 0;
    }

    .eyebrow {
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #64748b;
    }

    .report-heading h1 {
      margin: 2px 0 0;
      font-size: 17px;
      line-height: 1.2;
      font-weight: 700;
      color: var(--print-primary);
    }

    .scope {
      margin-top: 3px;
      font-size: 10px;
      color: #64748b;
    }

    .report-meta {
      display: grid;
      grid-template-columns: 1.45fr 1.45fr 1.2fr 0.55fr;
      gap: 8px;
      margin-bottom: 12px;
      padding: 8px 10px;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      background: #f8fafc;
      font-size: 9px;
    }

    .report-meta > div {
      min-width: 0;
    }

    .meta-label {
      display: block;
      margin-bottom: 2px;
      font-size: 7.5px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #94a3b8;
    }

    .report-meta strong {
      display: block;
      min-height: 14px;
      color: #334155;
      font-weight: 600;
      overflow-wrap: anywhere;
    }

    .write-line {
      border-bottom: 1px solid #94a3b8;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 9.5px;
    }

    thead {
      display: table-header-group;
    }

    thead th {
      background: var(--print-primary);
      color: var(--print-primary-foreground);
      text-align: left;
      padding: 7px 8px;
      font-weight: 650;
      line-height: 1.2;
    }

    tbody tr {
      break-inside: avoid;
      page-break-inside: avoid;
    }

    tbody td {
      min-height: 30px;
      height: 30px;
      padding: 5px 8px;
      border-bottom: 1px solid #e5e7eb;
      vertical-align: middle;
      line-height: 1.3;
      overflow-wrap: anywhere;
    }

    tbody tr:nth-child(even) {
      background: #f8fafc;
    }

    .row-number {
      color: #64748b;
      text-align: right;
    }

    .member-name {
      font-weight: 600;
      color: #0f172a;
    }

    .signature,
    .time {
      border-left: 1px solid #eef2f7;
    }

    .col-number { width: 5%; text-align: right; }
    .col-name { width: 34%; }
    .col-signature { width: 37%; }
    .col-time { width: 12%; }

    .report-footer {
      margin-top: auto;
      padding-top: 8px;
      border-top: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      gap: 16px;
      font-size: 8px;
      color: #94a3b8;
    }

    @media print {
      @page {
        size: A4 portrait;
        margin: 1.15cm 1.2cm 1cm;
      }

      html, body {
        width: 100%;
        background: #ffffff !important;
      }

      body {
        padding: 0;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      .report-page {
        min-height: 27.55cm;
        break-after: page;
        page-break-after: always;
      }

      .report-page:last-child {
        break-after: auto;
        page-break-after: auto;
      }

      .report-page + .report-page {
        margin-top: 0;
        padding-top: 0;
        border-top: 0;
      }

      thead {
        display: table-header-group;
      }
    }
  </style>
</head>
<body>
  ${pagesHtml}
</body>
</html>`;

    const w = window.open("", "_blank", "width=1000,height=800");
    if (!w) {
      alert("Please allow pop-ups to generate the attendance sheet.");
      return;
    }

    w.document.open();
    w.document.write(html);
    w.document.close();

    try {
      w.document.title = "Liturgical Ministry Registry — Attendance Sheet";
      w.history.replaceState({}, "", "/admin/members/attendance-sheet");
    } catch {
      // Printing still works if the browser keeps the temporary URL.
    }

    const printWhenReady = async () => {
      const images = Array.from(w.document.images);

      await Promise.all(
        images.map(
          (image) =>
            new Promise<void>((resolve) => {
              if (image.complete) {
                resolve();
                return;
              }

              image.addEventListener("load", () => resolve(), { once: true });
              image.addEventListener("error", () => resolve(), { once: true });
            })
        )
      );

      if (w.document.fonts?.ready) {
        await w.document.fonts.ready;
      }

      w.focus();
      w.print();
    };

    void printWhenReady();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-lg bg-background shadow-xl flex flex-col"
        onClick={(event) => event.stopPropagation()}
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
            <div>
              <p className="text-sm font-semibold">Printable Attendance Sheet</p>
              <p className="text-xs text-muted-foreground">
                {parishLabel} · {ministryLabel}
              </p>
            </div>
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
            {alphabetizedMembers.length} member{alphabetizedMembers.length === 1 ? "" : "s"} · Generated {generatedAt}
          </span>
          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Printer className="h-4 w-4" />
            Print Attendance Sheet
          </button>
        </div>

        <div className="overflow-auto scrollbar-thin p-5">
          <div className="mb-4 border border-border bg-muted/20 p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Parish / Mission Station
                </p>
                <p className="mt-1 text-sm font-medium">{parishLabel}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Ministry
                </p>
                <p className="mt-1 text-sm font-medium">{ministryLabel}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Date / Activity
                </p>
                <div className="mt-2 h-5 border-b border-border" />
              </div>
            </div>
          </div>

          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="py-2 pr-2 font-semibold text-muted-foreground">#</th>
                <th className="py-2 pr-2 font-semibold text-muted-foreground">Name</th>
                <th className="py-2 pr-2 font-semibold text-muted-foreground">Signature</th>
                <th className="py-2 pr-2 font-semibold text-muted-foreground">Time In</th>
                <th className="py-2 font-semibold text-muted-foreground">Time Out</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {alphabetizedMembers.map((member, index) => (
                <tr key={member.id} className="hover:bg-muted/30">
                  <td className="py-3 pr-2 text-muted-foreground">{index + 1}</td>
                  <td className="py-3 pr-2 font-medium">
                    {member.last_name}, {member.first_name}
                  </td>
                  <td className="py-3 pr-2">&nbsp;</td>
                  <td className="py-3 pr-2">&nbsp;</td>
                  <td className="py-3">&nbsp;</td>
                </tr>
              ))}
            </tbody>
          </table>
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
