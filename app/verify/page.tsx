"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { StatusBadge } from "@/components/status-badge";
import { CertificateDesign } from "@/components/certificate-design";
import type { CertificateDesignHandle } from "@/components/certificate-design";
import type { Member, CertificateTemplateSettings, Signatory } from "@/lib/types";
import {
  Search,
  ShieldCheck,
  Loader2,
  Church,
  Lock,
  Download,
  QrCode,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileBadge,
  ExternalLink,
  Users,
  Award,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";

export default function VerifyPageWrapper() {
  return (
    <Suspense fallback={<LoadingState />}>
      <VerifyPage />
    </Suspense>
  );
}

function LoadingState() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );
}

function VerifyPage() {
  const supabase = getSupabaseBrowserClient();
  const params = useSearchParams();
  const uidParam = params.get("uid");
  const [query, setQuery] = useState(uidParam ?? "");
  const [results, setResults] = useState<Member[]>([]);
  const [settings, setSettings] = useState<CertificateTemplateSettings | null>(null);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [searchedByUid, setSearchedByUid] = useState(false);
  const [signatories, setSignatories] = useState<Signatory[]>([]);
  const [selectedMinistry, setSelectedMinistry] = useState<string | null>(null);
  const [showMinistryDialog, setShowMinistryDialog] = useState(false);
  const [downloadCount, setDownloadCount] = useState(0);
  const certRef = useRef<CertificateDesignHandle>(null);

  useEffect(() => {
    // Load the default certificate template (public). The Admin Console
    // stores one or more rows keyed certificate_template[_<slug>]; the row
    // flagged is_default = true is the one used for public rendering.
    (async () => {
      const { data } = await supabase
        .from("system_settings")
        .select("*")
        .like("key", "certificate_template%")
        .eq("is_default", true)
        .maybeSingle();
      if (data?.value) {
        setSettings(data.value as CertificateTemplateSettings);
      } else {
        setSettings({
          template_url: null,
          name_x: 300,
          name_y: 320,
          parish_x: 300,
          parish_y: 400,
          ministry_x: 300,
          ministry_y: 460,
          year_x: 300,
          year_y: 540,
          qr_x: 440,
          qr_y: 680,
          qr_size: 120,
          liturgical_year: String(new Date().getFullYear()),
          font_family: "Georgia, serif",
          header_text: "Diocese of Navotas",
          body_text: "This is to certify that",
          footer_text: "has been duly commissioned as a liturgical minister",
        });
      }

      // Load active signatories (public read)
      const { data: sigData } = await supabase
        .from("signatories")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");
      setSignatories((sigData as Signatory[]) ?? []);
    })();
  }, [supabase]);

  const doSearch = useCallback(
    async (q: string) => {
      setSearching(true);
      setError(null);
      setResults([]);
      setSearched(true);
      const term = q.trim();
      if (!term) {
        setSearching(false);
        setSearchedByUid(false);
        setSearched(false);
        return;
      }

      // Check if the search term looks like a UID (starts with LMD-)
      const isUidSearch = /^LMD-\d{4}-/i.test(term);
      setSearchedByUid(isUidSearch);

      let found: Member[] = [];

      // Try UID match first (exact or prefix match)
      const uidRes = await supabase
        .from("members")
        .select("*")
        .ilike("uid", term);

      if (uidRes.data && uidRes.data.length > 0) {
        found = uidRes.data as Member[];
        setSearchedByUid(true);
      }

      // If UID search didn't find anything, try name search
      if (found.length === 0) {
        const parts = term.toLowerCase().split(/\s+/).filter(Boolean);
        if (parts.length >= 2) {
          const firstName = parts[0];
          const lastName = parts.slice(1).join(" ");
          const nameRes = await supabase
            .from("members")
            .select("*")
            .ilike("first_name", firstName)
            .ilike("last_name", lastName);
          found = (nameRes.data as Member[]) ?? [];
        } else {
          const anyRes = await supabase
            .from("members")
            .select("*")
            .or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%`);
          found = (anyRes.data as Member[]) ?? [];
        }
      }

      setResults(found);
      setSearching(false);
    },
    [supabase]
  );

  // Auto-search if ?uid= present
  useEffect(() => {
    if (uidParam) {
      setQuery(uidParam);
      setSearchedByUid(true);
      doSearch(uidParam);
    }
  }, [uidParam, doSearch]);

  // Reset download count and ministry selection when results change
  useEffect(() => {
    setDownloadCount(0);
    setSelectedMinistry(null);
    setShowMinistryDialog(false);
    // If single result, fetch current download count
    if (results.length === 1) {
      const member = results[0];
      (async () => {
        const { data } = await supabase
          .from("certificate_downloads")
          .select("*")
          .eq("member_id", member.id);
        const rows = (data as any[]) ?? [];
        // Sum all download counts for this member across ministries
        const total = rows.reduce((sum, r) => sum + (r.download_count ?? 0), 0);
        setDownloadCount(total);
      })();
    }
  }, [results, supabase]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    doSearch(query);
  };

  const canDownload =
    results.length === 1 &&
    settings &&
    searchedByUid &&
    (results[0].status === "New" || results[0].status === "Renewed");

  const reprintSuffix = downloadCount > 0 ? `-R${downloadCount}` : "";

  const trackDownload = async (memberId: string, ministry: string | null) => {
    const { data: existing } = await supabase
      .from("certificate_downloads")
      .select("*")
      .eq("member_id", memberId)
      .is("ministry", ministry ?? null);
    // .is() for nullable column — but we use COALESCE in the unique index, so query with filter
    let row = (existing as any)?.[0];
    if (!row) {
      // Try querying with ministry as empty string match
      const { data: existing2 } = await supabase
        .from("certificate_downloads")
        .select("*")
        .eq("member_id", memberId);
      const rows = (existing2 as any[]) ?? [];
      row = rows.find(
        (r) => (r.ministry ?? null) === (ministry ?? null)
      );
    }

    if (row) {
      const newCount = (row.download_count ?? 0) + 1;
      await supabase
        .from("certificate_downloads")
        .update({ download_count: newCount, updated_at: new Date().toISOString() })
        .eq("id", row.id);
      setDownloadCount(newCount);
    } else {
      await supabase.from("certificate_downloads").insert({
        member_id: memberId,
        ministry: ministry ?? null,
        download_count: 1,
      });
      setDownloadCount(1);
    }
  };

  const handleDownload = async () => {
    const member = results[0];
    if (!member || !settings) return;
    const ministry = member.ministries.length === 1
      ? member.ministries[0]
      : selectedMinistry;
    if (member.ministries.length > 1 && !ministry) {
      setShowMinistryDialog(true);
      return;
    }
    setGenerating(true);
    await trackDownload(member.id, ministry);
    const verifyUrl = `${window.location.origin}/verify?uid=${member.uid}`;
    await certRef.current?.download(`certificate-${member.uid}${reprintSuffix || ""}.png`);
    setGenerating(false);
  };

  const handleMinistrySelect = async (ministry: string) => {
    setShowMinistryDialog(false);
    setSelectedMinistry(ministry);
    const member = results[0];
    if (!member || !settings) return;
    setGenerating(true);
    await trackDownload(member.id, ministry);
    await certRef.current?.download(`certificate-${member.uid}.png`);
    setGenerating(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-red-50/40 to-background flex flex-col">
      <header className="border-b border-border/60 bg-background/80 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <Church className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold leading-tight">
                Public Verification
              </p>
              <p className="text-[11px] text-muted-foreground">
                Liturgical Ministry Registry
              </p>
            </div>
          </Link>
          <ShieldCheck className="h-5 w-5 text-primary" />
        </div>
      </header>

      <main className="flex-1 mx-auto max-w-3xl w-full px-4 sm:px-6 py-8 sm:py-12">
        <div className="text-center mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Verify a Member
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Enter a member&apos;s full name or Unique Identifier (UID) to confirm
            their liturgical ministry standing.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground pointer-events-none" />
          <input
            value={query}
            onChange={(e) => {
              const v = e.target.value;
              setQuery(v);
              if (v.trim() === "") {
                setResults([]);
                setSearched(false);
                setSearchedByUid(false);
                setError(null);
              }
            }}
            placeholder="e.g. Juan Dela Cruz or LMD-2026-0001"
            className="w-full rounded-full border border-input bg-background pl-11 pr-28 py-3.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring"
          />
          <button
            type="submit"
            disabled={searching}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60 shadow-sm"
          >
            {searching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <><Search className="h-4 w-4" /> Verify</>
            )}
          </button>
        </form>

        {/* Hidden certificate canvas (used for download rendering) */}
        {results.length === 1 && settings && (
          <CertificateDesign
            ref={certRef}
            settings={settings}
            data={{
              firstName: results[0].first_name,
              lastName: results[0].last_name,
              parish: results[0].parish,
              ministries: results[0].ministries,
              uid: results[0].uid,
              liturgicalYear: settings.liturgical_year,
              verifyUrl: `${typeof window !== "undefined" ? window.location.origin : ""}/verify?uid=${results[0].uid}`,
              selectedMinistry: selectedMinistry ?? (results[0].ministries.length === 1 ? results[0].ministries[0] : null),
              reprintSuffix,
            }}
            signatories={signatories}
            className="hidden"
          />
        )}

        <div className="mt-8">
          {searching && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-7 w-7 animate-spin text-primary mb-3" />
              <p className="text-sm text-muted-foreground">Searching the registry...</p>
            </div>
          )}

          {!searching && searched && results.length === 0 && !error && (
            <div className="rounded-lg border border-dashed border-border py-12 text-center">
              <AlertCircle className="mx-auto h-9 w-9 text-muted-foreground/50" />
              <p className="mt-3 text-sm font-medium text-foreground">
                No matching registry entries found.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Check the spelling or UID and try again. If the member was
                recently added, they may still be pending verification.
              </p>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 py-8 text-center">
              <AlertCircle className="mx-auto h-8 w-8 text-destructive" />
              <p className="mt-3 text-sm text-destructive">{error}</p>
            </div>
          )}

          {results.length > 0 && (
            <div className="space-y-5 animate-in-fade">
              {results.length > 1 && (
                <div className="flex items-center gap-2 rounded-md bg-primary/5 px-4 py-2.5 text-sm text-primary ring-1 ring-inset ring-primary/20">
                  <Users className="h-4 w-4 shrink-0" />
                  <span className="font-medium">
                    {results.length} matching registry entries found.
                  </span>
                  <span className="text-primary/80">
                    Certificate download requires an exact UID search.
                  </span>
                </div>
              )}

              {results.map((member) => {
                const status = member.status;
                return (
                  <div key={member.id} className="space-y-4">
                    {/* Status banner */}
                    {status === "Pending Verification" && (
                      <div className="rounded-lg border-2 border-amber-300 bg-amber-50 px-5 py-4">
                        <div className="flex items-start gap-3">
                          <Clock className="h-5 w-5 text-amber-700 mt-0.5 shrink-0" />
                          <div>
                            <p className="font-semibold text-amber-900">
                              Pending Recommendation Letter
                            </p>
                            <p className="text-sm text-amber-800 mt-0.5">
                              Documents are currently processing at the Head Office.
                              The member&apos;s certificate will be available once
                              verification is complete.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {status === "Inactive" && (
                      <div className="rounded-lg border-2 border-rose-300 bg-rose-50 px-5 py-4">
                        <div className="flex items-start gap-3">
                          <AlertCircle className="h-5 w-5 text-rose-700 mt-0.5 shrink-0" />
                          <div>
                            <p className="font-semibold text-rose-900">
                              Member Inactive
                            </p>
                            <p className="text-sm text-rose-800 mt-0.5">
                              This member is no longer serving in an active liturgical
                              ministry capacity.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Privacy-safe result card */}
                    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <FileBadge className="h-5 w-5 text-primary" />
                            <h2 className="text-lg font-bold">
                              {member.first_name} {member.last_name}
                            </h2>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            {member.parish}
                          </p>
                        </div>
                        <StatusBadge status={status} />
                      </div>

                      <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="rounded-md bg-muted/40 p-3">
                          <p className="text-xs text-muted-foreground">Parish</p>
                          <p className="text-sm font-medium mt-0.5">{member.parish}</p>
                        </div>
                        <div className="rounded-md bg-muted/40 p-3">
                          <p className="text-xs text-muted-foreground">Registered Ministry/Ministries</p>
                          <p className="text-sm font-medium mt-0.5">{member.ministries.join(", ")}</p>
                        </div>
                      </div>

                      {(status === "New" || status === "Renewed") && (
                        <div className="mt-4 flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800 ring-1 ring-inset ring-emerald-600/20">
                          <CheckCircle2 className="h-4 w-4 shrink-0" />
                          <span className="font-medium">Verified Active Member</span>
                          <span className="text-emerald-700">— authorized to serve in the {settings?.liturgical_year} liturgical year.</span>
                        </div>
                      )}

                      {/* Certificate section — only for single UID-verified result */}
                      <div className="mt-6 pt-5 border-t border-border">
                        {canDownload && results.length === 1 ? (
                          <div className="space-y-3">
                            {member.ministries.length > 1 && (
                              <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-inset ring-amber-600/20">
                                <Award className="inline h-3.5 w-3.5 mr-1" />
                                This member has {member.ministries.length} ministries. Select which certificate to download.
                              </div>
                            )}
                            {downloadCount > 0 && (
                              <div className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-800 ring-1 ring-inset ring-blue-600/20">
                                This certificate has been downloaded {downloadCount} time{downloadCount > 1 ? "s" : ""} before.
                                The next download will include the suffix <code className="font-mono font-semibold">-R{downloadCount + 1}</code> on the UID.
                              </div>
                            )}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold flex items-center gap-1.5">
                                  <ShieldCheck className="h-4 w-4 text-primary" />
                                  Official Certificate Available
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  Download includes a QR code linking to this verification page.
                                </p>
                              </div>
                              <button
                                onClick={handleDownload}
                                disabled={generating}
                                className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60 shadow-sm w-full sm:w-auto"
                              >
                                {generating ? (
                                  <><Loader2 className="h-4 w-4 animate-spin" /> Generating...</>
                                ) : (
                                  <><Download className="h-4 w-4" /> Download Official Certificate</>
                                )}
                              </button>
                            </div>
                            <div className="flex items-center gap-2 rounded-md bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                              <QrCode className="h-3.5 w-3.5" />
                              Verification URL: <code className="font-mono">{`${typeof window !== "undefined" ? window.location.origin : ""}/verify?uid=${member.uid}`}</code>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/20 px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
                                <Lock className="h-4 w-4" />
                              </div>
                              <div>
                                <p className="text-sm font-medium">Certificate Download Unavailable</p>
                                <p className="text-xs text-muted-foreground">
                                  {!searchedByUid
                                    ? "Certificate download requires the exact Registry ID. Search by UID (e.g., LMD-2026-0001) to unlock the official certificate download."
                                    : results.length > 1
                                    ? "Multiple entries matched this UID. Refine your search to a single record."
                                    : "Download is locked until verification is complete."}
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              <p className="text-center text-xs text-muted-foreground">
                This public lookup does not expose personal contact details or document links.
              </p>
            </div>
          )}

          {!searched && !searching && (
            <div className="rounded-lg border border-dashed border-border py-12 text-center">
              <ShieldCheck className="mx-auto h-9 w-9 text-muted-foreground/50" />
              <p className="mt-3 text-sm font-medium text-foreground">
                Enter a name or UID above to verify a member.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                For parish priests: scan the QR code on a member&apos;s certificate
                to reach this page directly.
              </p>
            </div>
          )}
        </div>
      </main>

      <footer className="border-t border-border/60 mt-auto">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-5 flex flex-col items-center gap-3">
          <Image
            src="/images/Asset_1.svg"
            alt="Liturgical Ministry Registry"
            width={200}
            height={80}
            priority
            className="h-16 sm:h-20 md:h-24 w-auto"
          />
          <p className="text-xs text-muted-foreground text-center">
            Liturgical Ministry Registry — Public Verification Portal
          </p>
        </div>
      </footer>

      {/* Ministry selection dialog for multi-ministry members */}
      {showMinistryDialog && results.length === 1 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="rounded-xl border border-border bg-card p-6 shadow-xl max-w-md w-full mx-4 animate-in-fade">
            <div className="flex items-center gap-2 mb-4">
              <Award className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold">Select Certificate Ministry</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              {results[0].first_name} {results[0].last_name} is registered in
              multiple ministries. Choose which certificate to download:
            </p>
            <div className="space-y-2">
              {results[0].ministries.map((min) => (
                <button
                  key={min}
                  onClick={() => handleMinistrySelect(min)}
                  className="w-full text-left rounded-md border border-border px-4 py-3 text-sm font-medium hover:bg-primary/5 hover:border-primary/30 transition-colors"
                >
                  {min}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowMinistryDialog(false)}
              className="mt-4 w-full text-center text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
