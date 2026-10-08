"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { createPortal } from "react-dom";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { StatusBadge } from "@/components/status-badge";
import { VerificationResultSelector } from "@/components/verification-result-selector";
import { CertificateDesign } from "@/components/certificate-design";
import type { CertificateDesignHandle } from "@/components/certificate-design";
import type { Member, MemberMinistry, CertificateTemplateSettings, Signatory } from "@/lib/types";
import { DEFAULT_TEMPLATE_SETTINGS, getExpirationStatus } from "@/lib/constants";
import {
  Search,
  ShieldCheck,
  Loader2,
  Lock,
  Download,
  Printer,
  CheckCircle2,
  Clock,
  AlertCircle,
  ExternalLink,
  Users,
  Mail,
  X,
} from "lucide-react";
import { RegistryFooter } from "@/components/registry-footer";
import { ebGaramond } from "@/app/fonts";

export default function VerifyPageWrapper() {
  return (
    <Suspense fallback={<LoadingState />}>
      <VerifyPage />
    </Suspense>
  );
}

function LoadingState() {
  return (
    <div role="status" aria-live="polite" className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 aria-hidden="true" className="h-6 w-6 animate-spin text-primary" />
      <span className="sr-only">Loading verification portal...</span>
    </div>
  );
}

type PublicMembership = Pick<
  MemberMinistry,
  "id" | "member_id" | "ministry" | "status" | "expiration_date"
>;

interface PublicMember extends Pick<
  Member,
  | "id"
  | "uid"
  | "first_name"
  | "last_name"
  | "parish"
  | "ministries"
  | "status"
  | "service_year"
  | "expiration_date"
> {
  member_ministries: PublicMembership[];
}
function VerifyPage() {
  const supabase = getSupabaseBrowserClient();
  const params = useSearchParams();
  const uidParam = params.get("uid");
  const printParam = params.get("print") === "1";
  const [query, setQuery] = useState(uidParam ?? "");
  const [results, setResults] = useState<PublicMember[]>([]);
  const [printReady, setPrintReady] = useState(false);
  const [settings, setSettings] = useState<CertificateTemplateSettings | null>(null);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [searchedByUid, setSearchedByUid] = useState(false);
  const [signatories, setSignatories] = useState<Signatory[]>([]);
  const [selectedMinistry, setSelectedMinistry] = useState<string | null>(null);
  const [downloadCount, setDownloadCount] = useState(0);
  const [activeResultIndex, setActiveResultIndex] = useState(0);
  const [detailsMounted, setDetailsMounted] = useState(false);
  const [detailsVisible, setDetailsVisible] = useState(false);
  const detailsCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const certRef = useRef<CertificateDesignHandle>(null);
  const downloadButtonRef = useRef<HTMLButtonElement>(null);

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
        setSettings(DEFAULT_TEMPLATE_SETTINGS);
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
        setError("Enter a member name or Registry ID to verify.");
        return;
      }

      // Public verification only needs these fields.
      // Never expose internal document URLs, notes, or archived documents.
      const publicFields =
        "id,uid,first_name,last_name,parish,ministries,status,service_year,expiration_date";

      const attachMemberships = async (
        members: Omit<PublicMember, "member_ministries">[]
      ): Promise<PublicMember[]> => {
        if (members.length === 0) return [];

        const memberIds = members.map((member) => member.id);
        const { data: membershipRows, error: membershipError } = await supabase
          .from("member_ministries")
          .select("id,member_id,ministry,status,expiration_date")
          .in("member_id", memberIds);

        if (membershipError) {
          console.error("Unable to load public ministry memberships:", membershipError);
          return members.map((member) => ({
            ...member,
            member_ministries: [],
          }));
        }

        const rows = ((membershipRows as PublicMembership[]) ?? []).sort((a, b) =>
          a.ministry.localeCompare(b.ministry)
        );

        return members.map((member) => ({
          ...member,
          member_ministries: rows.filter((row) => row.member_id === member.id),
        }));
      };

      // A complete Registry ID must follow LMD-YYYY-NNNN.
      const isCompleteUid = /^LMD-\d{4}-\d+$/i.test(term);
      const looksLikeUid = /^LMD-/i.test(term);

      setSearchedByUid(isCompleteUid);

      let found: PublicMember[] = [];

      // ------------------------------------------------------------
      // 1. Exact Registry ID search
      // ------------------------------------------------------------
      if (isCompleteUid) {
        const { data, error: uidError } = await supabase
          .from("members")
          .select(publicFields)
          .ilike("uid", term)
          .limit(1);

        if (uidError) {
          setError("Unable to complete the registry search. Please try again.");
        } else {
          try {
            found = await attachMemberships(
              ((data ?? []) as Omit<PublicMember, "member_ministries">[])
            );
          } catch (membershipError) {
            console.error("Unable to attach ministry memberships:", membershipError);
            found = ((data ?? []) as Omit<PublicMember, "member_ministries">[]).map(
              (member) => ({
                ...member,
                member_ministries: [],
              })
            );
          }
        }

        setResults(found);
        setSearching(false);
        return;
      }

      // ------------------------------------------------------------
      // 2. Incomplete UID-like input
      // ------------------------------------------------------------
      if (looksLikeUid) {
        setError(
          "Please enter the complete Registry ID, for example LMD-2027-0001."
        );
        setResults([]);
        setSearching(false);
        return;
      }

      // ------------------------------------------------------------
      // 3. Name search
      //
      // Search each word independently, then require every word to
      // appear somewhere in the member's first/last name.
      //
      // This supports:
      //   Gerarda Pesa
      //   Pesa Gerarda
      //   Gerarda
      //   Pesa
      // ------------------------------------------------------------
      const tokens = term
        .toLowerCase()
        .split(/\s+/)
        .map((token) => token.trim())
        .filter(Boolean);

      const escapeIlike = (value: string) =>
        value.replace(/[%_\\]/g, (char) => `\\${char}`);

      const candidateMap = new Map<string, PublicMember>();

      for (const token of tokens) {
        const safeToken = escapeIlike(token);

        const { data, error: nameError } = await supabase
          .from("members")
          .select(publicFields)
          .or(
            `first_name.ilike.%${safeToken}%,last_name.ilike.%${safeToken}%`
          )
          .limit(100);

        if (nameError) {
          setError(
            "Unable to complete the registry search. Please try again."
          );
          setResults([]);
          setSearching(false);
          return;
        }

        for (const member of
          ((data ?? []) as Omit<PublicMember, "member_ministries">[])) {
          candidateMap.set(member.id, {
            ...member,
            member_ministries: [],
          });
        }
      }

      // Require every search token to occur somewhere in the full name.
      found = Array.from(candidateMap.values()).filter((member) => {
        const first = member.first_name.toLowerCase().trim();
        const last = member.last_name.toLowerCase().trim();
        const fullName = `${first} ${last}`;

        return tokens.every((token) => fullName.includes(token));
      });
      // Prefer exact full-name matches, then shorter names / alphabetical.
      found.sort((a, b) => {
        const aFull = `${a.first_name} ${a.last_name}`.toLowerCase().trim();
        const bFull = `${b.first_name} ${b.last_name}`.toLowerCase().trim();
        const normalizedTerm = tokens.join(" ");

        const aExact = aFull === normalizedTerm ? 1 : 0;
        const bExact = bFull === normalizedTerm ? 1 : 0;

        if (aExact !== bExact) return bExact - aExact;

        return aFull.localeCompare(bFull);
      });

      try {
        found = await attachMemberships(
          found.map(({ member_ministries: _memberMinistries, ...member }) => member)
        );
      } catch (membershipError) {
        console.error("Unable to attach ministry memberships:", membershipError);
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

    // Print-only flow for the Admin "Print UID Certificate" action.
  useEffect(() => {
    if (!printParam || results.length !== 1 || !settings) return;

    let cancelled = false;

    const preparePrint = async () => {
      setPrintReady(false);

      const canvas = await certRef.current?.render();

      if (!canvas || cancelled) return;

      setPrintReady(true);

      // Let React paint the print layout before opening the browser dialog.
      window.requestAnimationFrame(() => {
        if (!cancelled) {
          window.print();
        }
      });
    };

    void preparePrint();

    return () => {
      cancelled = true;
    };
  }, [printParam, results, settings]);

  const openDetails = useCallback(() => {
    if (detailsCloseTimerRef.current) {
      clearTimeout(detailsCloseTimerRef.current);
      detailsCloseTimerRef.current = null;
    }

    setDetailsMounted(true);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setDetailsVisible(true);
      });
    });
  }, []);

  const closeDetails = useCallback(() => {
    setDetailsVisible(false);

    if (detailsCloseTimerRef.current) {
      clearTimeout(detailsCloseTimerRef.current);
    }

    detailsCloseTimerRef.current = setTimeout(() => {
      setDetailsMounted(false);
      detailsCloseTimerRef.current = null;
    }, 220);
  }, []);

  useEffect(() => {
    return () => {
      if (detailsCloseTimerRef.current) {
        clearTimeout(detailsCloseTimerRef.current);
      }
    };
  }, []);

  // Reset the active result when a fresh result set arrives.
  useEffect(() => {
    setActiveResultIndex(0);
    setDetailsVisible(false);
    setDetailsMounted(false);
  }, [results]);

  const activeMember =
    results[activeResultIndex] ?? results[0] ?? null;

  useEffect(() => {
    if (!detailsMounted) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeDetails();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [detailsMounted, closeDetails]);

  // Reset certificate selection when the selected result changes.
  // Prefer the first certificate-eligible ministry for the active member.
  useEffect(() => {
    setDownloadCount(0);

    if (!activeMember) {
      setSelectedMinistry(null);
      return;
    }

    const rows = activeMember.member_ministries;
    const preferred =
      rows.find((membership) => {
        const expiration = getExpirationStatus(membership.expiration_date);
        return (
          (membership.status === "New" || membership.status === "Renewed") &&
          expiration !== "expired" &&
          expiration !== "expiring_soon"
        );
      }) ?? rows[0];

    setSelectedMinistry(preferred?.ministry ?? null);
  }, [activeMember]);


  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    doSearch(query);
  };

  const singleMember = results.length === 1 ? results[0] : null;
  const memberships = activeMember?.member_ministries ?? [];

  const membershipIsEligible = (membership: PublicMembership) => {
    const expirationStatus = getExpirationStatus(membership.expiration_date);
    return (
      (membership.status === "New" || membership.status === "Renewed") &&
      expirationStatus !== "expired" &&
      expirationStatus !== "expiring_soon"
    );
  };

  const selectedMembership =
    memberships.find((membership) => membership.ministry === selectedMinistry) ??
    (memberships.length === 1 ? memberships[0] : null);

  const eligibleMemberships = memberships.filter(membershipIsEligible);

  const canDownload =
    Boolean(singleMember) &&
    Boolean(settings) &&
    searchedByUid &&
    eligibleMemberships.length > 0;

  // Track reprint count for the selected ministry membership only.
  useEffect(() => {
    setDownloadCount(0);

    if (!selectedMembership) return;

    (async () => {
      const { data } = await supabase
        .from("certificate_downloads")
        .select("download_count")
        .eq("member_ministry_id", selectedMembership.id)
        .maybeSingle();

      setDownloadCount(data?.download_count ?? 0);
    })();
  }, [selectedMembership, supabase]);


  const reprintSuffix =
    downloadCount > 0 ? `-R${downloadCount + 1}` : "";

  const waitForCertificateRender = () =>
    new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });

  const trackDownload = async (membership: PublicMembership) => {
    const { data: existing } = await supabase
      .from("certificate_downloads")
      .select("*")
      .eq("member_ministry_id", membership.id)
      .maybeSingle();

    if (existing) {
      const newCount = (existing.download_count ?? 0) + 1;
      await supabase
        .from("certificate_downloads")
        .update({
          download_count: newCount,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      setDownloadCount(newCount);
      return;
    }

    const member = results[0];
    if (!member) return;

    await supabase.from("certificate_downloads").insert({
      member_id: member.id,
      member_ministry_id: membership.id,
      ministry: membership.ministry,
      download_count: 1,
    });
    setDownloadCount(1);
  };

  const handleDownload = async () => {
    const member = results[0];
    if (!member || !settings) return;

    if (!selectedMembership || !membershipIsEligible(selectedMembership)) return;

    setGenerating(true);

    try {
      await certRef.current?.download(
        `certificate-${member.uid}${reprintSuffix}.png`
      );

      await trackDownload(selectedMembership);
    } finally {
      setGenerating(false);
    }
  };

    const handlePrint = async () => {
  const member = results[0];
  if (!member || !settings) return;

  if (!selectedMembership || !membershipIsEligible(selectedMembership)) return;

  // Open the print window immediately while this is still a user-initiated action.
  const printWindow = window.open("", "_blank", "width=900,height=1000");

  if (!printWindow) {
    setError("Please allow pop-ups for this site to print the certificate.");
    return;
  }

  setGenerating(true);

  try {
    // Render the exact same canvas used by the Download button.
    const canvas = await certRef.current?.render();

    if (!canvas) {
      printWindow.close();
      setError("Unable to render the certificate for printing.");
      return;
    }

    await trackDownload(selectedMembership);

    const png = canvas.toDataURL("image/png");

    printWindow.document.open();
    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Certificate - ${member.uid}</title>
          <style>
            @page {
              size: Letter portrait;
              margin: 0;
            }

            html,
            body {
              width: 8.5in;
              height: 11in;
              margin: 0;
              padding: 0;
              background: #fff;
              overflow: hidden;
            }

            body {
              display: flex;
              align-items: center;
              justify-content: center;
            }

            img {
              display: block;
              width: 8.5in;
              height: 11in;
              object-fit: contain;
              margin: 0;
              padding: 0;
            }

            @media print {
              html,
              body {
                width: 8.5in;
                height: 11in;
                margin: 0;
                padding: 0;
              }

              img {
                width: 8.5in;
                height: 11in;
              }
            }
          </style>
        </head>
        <body>
          <img
            src="${png}"
            alt="Official certificate"
          />
        </body>
      </html>
    `);
    printWindow.document.close();

    const image = printWindow.document.querySelector("img");

    if (!image) {
      printWindow.close();
      setError("Unable to prepare the certificate for printing.");
      return;
    }

    const print = () => {
      printWindow.focus();
      printWindow.print();
    };

    if (image.complete) {
      print();
    } else {
      image.onload = print;
      image.onerror = () => {
        printWindow.close();
        setError("Unable to load the certificate image for printing.");
      };
    }
  } catch (error) {
    printWindow.close();
    setError(
      error instanceof Error
        ? error.message
        : "Unable to prepare the certificate for printing."
    );
  } finally {
    setGenerating(false);
  }
};



  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {!printParam && (
        <header className="border-b border-border/70 bg-background">
          <div className="mx-auto flex w-full max-w-[1240px] items-center justify-between gap-4 px-5 py-4 sm:px-7 lg:px-12">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#faedf0] text-[#970e24]">
                <Search className="h-5 w-5" aria-hidden="true" />
              </div>

              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#970e24]">
                  Public Verification
                </p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  Liturgical Ministry Registry
                </p>
              </div>
            </div>

            <Link
              href="/"
              className="shrink-0 text-sm font-semibold text-foreground transition-colors hover:text-[#970e24] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#970e24]/25 focus-visible:ring-offset-4"
            >
              Home
            </Link>
          </div>
        </header>
      )}

      <main
        className={`flex-1 mx-auto w-full max-w-[1240px] px-5 py-10 sm:px-7 sm:py-12 lg:px-12 lg:py-14 ${
          printParam ? "certificate-print-mode" : ""
        }`}
      >
        {!printParam && (
          <section className="overflow-hidden rounded-2xl border border-[#e7c8cf] bg-white shadow-[0_28px_70px_-42px_rgba(82,8,28,0.45)]">
            <div className="grid lg:grid-cols-[0.92fr_1.08fr]">
              <div className="bg-[#970e24] px-6 py-9 text-white sm:px-8 sm:py-11 lg:px-10 lg:py-12">
                <h1
                  className={`${ebGaramond.className} max-w-md text-4xl font-medium leading-[0.98] tracking-tight sm:text-5xl`}
                >
                  Verify a minister
                </h1>

                <div className="mt-6 border-t border-white/20 pt-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-white/65">
                    For official certificate checks
                  </p>
                  <p className="mt-2 text-sm leading-6 text-white/85">
                    Use the Registry ID printed on the certificate or scan its QR
                    code for the most precise result.
                  </p>
                </div>
              </div>

              <div className="flex items-center px-6 py-8 sm:px-8 sm:py-10 lg:px-10">
                <form onSubmit={handleSubmit} className="w-full">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#970e24]">
                      Search the registry
                    </p>
                    <h2 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">
                      Member name or Registry ID
                    </h2>
                  </div>

                  <label
                    htmlFor="member-search"
                    className="mt-6 block text-sm font-semibold text-foreground"
                  >
                    Search term
                  </label>

                  <div className="mt-2 flex flex-col gap-3 sm:flex-row">
                    <div className="relative min-w-0 flex-1">
                      <Search
                        aria-hidden="true"
                        className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground"
                      />
                      <input
                        id="member-search"
                        aria-invalid={Boolean(error)}
                        aria-describedby={
                          error
                            ? "member-search-hint member-search-error"
                            : "member-search-hint"
                        }
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
                        placeholder="Juan Dela Cruz or LMD-2026-0001"
                        className="min-h-12 w-full rounded-md border border-input bg-background py-3 pl-12 pr-4 text-sm shadow-sm transition-colors placeholder:text-muted-foreground/75 focus-visible:border-[#970e24] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#970e24]/20"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={searching}
                      aria-label={searching ? "Verifying member" : "Verify member"}
                      aria-busy={searching}
                      className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-md bg-[#970e24] px-5 py-3 text-sm font-semibold text-white shadow-sm transition-[transform,background-color,box-shadow] hover:-translate-y-0.5 hover:bg-[#730a1c] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#970e24]/30 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 disabled:hover:translate-y-0 sm:min-w-[132px]"
                    >
                      {searching ? (
                        <>
                          <Loader2
                            aria-hidden="true"
                            className="h-4 w-4 animate-spin"
                          />
                          Verifying
                        </>
                      ) : (
                        <>
                          <Search aria-hidden="true" className="h-4 w-4" />
                          Verify
                        </>
                      )}
                    </button>
                  </div>

                  <p
                    id="member-search-hint"
                    className="mt-3 text-xs leading-5 text-muted-foreground"
                  >
                    Exact Registry ID searches unlock eligible ministry
                    certificates.
                  </p>
                </form>
              </div>
            </div>
          </section>
        )}

        {/* Hidden certificate canvas (used for download rendering) */}
        {results.length === 1 && settings && (
          <CertificateDesign
            ref={certRef}
            settings={settings}
            data={{
              firstName: results[0].first_name,
              lastName: results[0].last_name,
              parish: results[0].parish,
              ministries: results[0].member_ministries.map((membership) => membership.ministry),
              uid: results[0].uid,
              liturgicalYear: settings.liturgical_year,
              verifyUrl: `${typeof window !== "undefined" ? window.location.origin : ""}/verify?uid=${results[0].uid}`,
              selectedMinistry:
                selectedMinistry ??
                (results[0].member_ministries.length === 1
                  ? results[0].member_ministries[0].ministry
                  : null),
              reprintSuffix,
            }}
            signatories={signatories}
            className={printParam ? "print-certificate-canvas" : "hidden"}
          />
        )}

        <div className={printParam ? "mt-0" : "mt-10"}>
          {searching && (
            <div role="status" className="flex flex-col items-center justify-center py-12">
              <Loader2 aria-hidden="true" className="h-7 w-7 animate-spin text-primary mb-3" />
              <p className="text-sm text-muted-foreground">Searching the registry...</p>
            </div>
          )}

          {!searching && searched && results.length === 0 && !error && (
            <div role="status" className="rounded-lg border border-dashed border-border py-12 text-center">
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
            <div
              id="member-search-error"
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/5 py-8 text-center"
            >
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

              <VerificationResultSelector
                results={results}
                activeIndex={activeResultIndex}
                onChange={setActiveResultIndex}
                onViewDetails={openDetails}
              />

              {detailsMounted &&
                activeMember &&
                createPortal(
                <div
                  className={[
                    "fixed inset-0 z-[80] flex items-center justify-center p-3 transition-[opacity,background-color,backdrop-filter] duration-200 ease-out sm:p-6",
                    detailsVisible
                      ? "bg-black/50 opacity-100 backdrop-blur-[2px]"
                      : "bg-black/0 opacity-0 backdrop-blur-0",
                  ].join(" ")}
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="verification-details-title"
                  onMouseDown={(event) => {
                    if (event.target === event.currentTarget) {
                      closeDetails();
                    }
                  }}
                >
                  <div
                    className={[
                      "flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl will-change-transform transition-[transform,opacity] duration-200 ease-out",
                      detailsVisible
                        ? "translate-y-0 scale-100 opacity-100"
                        : "translate-y-3 scale-[0.985] opacity-0",
                    ].join(" ")}
                  >
                    <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
                      <div className="min-w-0">
                        <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#970e24]">
                          Registry verification
                        </p>
                        <h2
                          id="verification-details-title"
                          className={`${ebGaramond.className} mt-1 truncate text-2xl font-semibold tracking-tight sm:text-3xl`}
                        >
                          {activeMember.first_name} {activeMember.last_name}
                        </h2>
                        <p className="mt-1 truncate text-sm text-muted-foreground">
                          {activeMember.parish}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={closeDetails}
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#970e24]/25"
                        aria-label="Close verification details"
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>

                    <div className="overflow-y-auto px-4 py-5 sm:px-6 sm:py-6">
                      {[activeMember].map((member) => {
                  const memberMemberships = member.member_ministries;
                  const memberEligibleMemberships =
                    memberMemberships.filter(membershipIsEligible);
                  const correctionSubject = `Name correction request — ${member.uid}`;
                  const correctionBody = [
                    "Hello Diocesan Commission on Worship & Liturgy,",
                    "",
                    "I would like to report a possible correction to a registry member name.",
                    "",
                    `Registry ID: ${member.uid}`,
                    `Currently displayed name: ${member.first_name} ${member.last_name}`,
                    `Parish: ${member.parish}`,
                    "",
                    "Requested correction:",
                    "",
                    "Supporting details (if any):",
                    "",
                    "Thank you.",
                  ].join("\n");
                  const correctionHref = `mailto:cowlkalookan2025@gmail.com?subject=${encodeURIComponent(
                    correctionSubject
                  )}&body=${encodeURIComponent(correctionBody)}`;

                  return (
                    <div key={member.id} className="space-y-4">
                      {memberMemberships.length === 0 && (
                        <div className="rounded-lg border-2 border-amber-300 bg-amber-50 px-5 py-4">
                          <div className="flex items-start gap-3">
                            <Clock className="h-5 w-5 text-amber-700 mt-0.5 shrink-0" />
                            <div>
                              <p className="font-semibold text-amber-900">
                                Ministry Membership Pending
                              </p>
                              <p className="text-sm text-amber-800 mt-0.5">
                                No ministry membership record is currently available for
                                public verification.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                        <div className="flex flex-col gap-2 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
                          <div>
                            <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#970e24]">
                              Verification details
                            </p>
                            <h2 className="mt-1 text-lg font-semibold tracking-tight">
                              Ministry standing
                            </h2>
                          </div>

                          {memberEligibleMemberships.length > 0 && (
                            <span className="text-xs font-medium text-emerald-700">
                              {memberEligibleMemberships.length} certificate-eligible
                            </span>
                          )}
                        </div>

                        <div className="mt-5 space-y-3">

                          {memberMemberships.map((membership) => {
                            const membershipExpiration =
                              getExpirationStatus(membership.expiration_date);
                            const eligible = membershipIsEligible(membership);

                            return (
                              <div
                                key={membership.id}
                                className="rounded-lg border border-border bg-background p-4"
                              >
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                  <div className="min-w-0">
                                    <p className="text-sm font-semibold">
                                      {membership.ministry}
                                    </p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                      {membership.expiration_date
                                        ? `Valid through ${new Date(
                                            `${membership.expiration_date}T00:00:00`
                                          ).toLocaleDateString()}`
                                        : "No expiration date recorded"}
                                    </p>
                                  </div>

                                  <div className="flex flex-wrap items-center gap-2">
                                    <StatusBadge status={membership.status} />
                                    {membershipExpiration === "expired" && (
                                      <span className="inline-flex items-center rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 ring-1 ring-inset ring-rose-600/20">
                                        Expired
                                      </span>
                                    )}
                                    {membershipExpiration === "expiring_soon" && (
                                      <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-600/20">
                                        Expiring Soon
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {eligible && (
                                  <div
                                    role="status"
                                    className="mt-3 flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800 ring-1 ring-inset ring-emerald-600/20"
                                  >
                                    <CheckCircle2
                                      aria-hidden="true"
                                      className="h-3.5 w-3.5 shrink-0"
                                    />
                                    Verified active ministry membership.
                                  </div>
                                )}

                                {membership.status === "Pending Verification" && (
                                  <div className="mt-3 flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-inset ring-amber-600/20">
                                    <Clock
                                      aria-hidden="true"
                                      className="h-3.5 w-3.5 shrink-0"
                                    />
                                    Pending recommendation-letter verification.
                                  </div>
                                )}

                                {membership.status === "Inactive" && (
                                  <div className="mt-3 flex items-center gap-2 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-800 ring-1 ring-inset ring-rose-600/20">
                                    <AlertCircle
                                      aria-hidden="true"
                                      className="h-3.5 w-3.5 shrink-0"
                                    />
                                    This ministry membership is inactive.
                                  </div>
                                )}

                                {membershipExpiration === "expired" && (
                                  <div className="mt-3 flex items-center gap-2 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-800 ring-1 ring-inset ring-rose-600/20">
                                    <AlertCircle
                                      aria-hidden="true"
                                      className="h-3.5 w-3.5 shrink-0"
                                    />
                                    Recommendation letter expired; certificate unavailable
                                    for this ministry.
                                  </div>
                                )}

                                {membershipExpiration === "expiring_soon" && (
                                  <div className="mt-3 flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-inset ring-amber-600/20">
                                    <Clock
                                      aria-hidden="true"
                                      className="h-3.5 w-3.5 shrink-0"
                                    />
                                    Recommendation letter is expiring soon; certificate is
                                    temporarily unavailable for this ministry.
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        <div className="mt-6 pt-5 border-t border-border">
                          {searchedByUid && memberMemberships.length > 1 && (
                            <div className="mb-4 space-y-1.5">
                              <label
                                htmlFor="certificate-ministry"
                                className="text-xs font-medium text-muted-foreground"
                              >
                                Certificate ministry
                              </label>
                              <select
                                id="certificate-ministry"
                                value={selectedMinistry ?? ""}
                                onChange={(event) =>
                                  setSelectedMinistry(event.target.value)
                                }
                                className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                {memberMemberships.map((membership) => {
                                  const eligible =
                                    membershipIsEligible(membership);
                                  return (
                                    <option
                                      key={membership.id}
                                      value={membership.ministry}
                                    >
                                      {membership.ministry}
                                      {eligible ? "" : " — unavailable"}
                                    </option>
                                  );
                                })}
                              </select>
                            </div>
                          )}

                          {canDownload && selectedMembership ? (
                            <div className="space-y-3">
                              {downloadCount > 0 && (
                                <div className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-800 ring-1 ring-inset ring-blue-600/20">
                                  This ministry certificate has been downloaded{" "}
                                  {downloadCount} time{downloadCount > 1 ? "s" : ""} before.
                                  The next download will include the suffix{" "}
                                  <code className="font-mono font-semibold">
                                    -R{downloadCount + 1}
                                  </code>{" "}
                                  on the UID.
                                </div>
                              )}

                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold flex items-center gap-1.5">
                                    <ShieldCheck className="h-4 w-4 text-primary" />
                                    Official Certificate Available
                                  </p>
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    Certificate for {selectedMembership.ministry}.
                                  </p>
                                </div>

                                <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                                  <button
                                    type="button"
                                    ref={downloadButtonRef}
                                    onClick={handleDownload}
                                    disabled={generating}
                                    className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60 shadow-sm w-full sm:w-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                  >
                                    {generating ? (
                                      <>
                                        <Loader2
                                          aria-hidden="true"
                                          className="h-4 w-4 animate-spin"
                                        />
                                        Generating...
                                      </>
                                    ) : (
                                      <>
                                        <Download
                                          aria-hidden="true"
                                          className="h-4 w-4"
                                        />
                                        Download Official Certificate
                                      </>
                                    )}
                                  </button>

                                  <button
                                    type="button"
                                    onClick={handlePrint}
                                    disabled={generating}
                                    className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-background px-4 py-2.5 text-sm font-semibold hover:bg-muted transition-colors disabled:opacity-60 w-full sm:w-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                  >
                                    <Printer
                                      aria-hidden="true"
                                      className="h-4 w-4"
                                    />
                                    Print Certificate
                                  </button>
                                </div>
                              </div>

                            </div>
                          ) : (
                            <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/20 px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
                                  <Lock className="h-4 w-4" />
                                </div>
                                <div>
                                  <p className="text-sm font-medium">
                                    Certificate Download Unavailable
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {!searchedByUid
                                      ? "Certificate download requires the exact Registry ID. Search by UID to unlock eligible ministry certificates."
                                      : selectedMembership
                                      ? "The selected ministry is not currently eligible for certificate download or printing."
                                      : "No certificate-eligible ministry membership is available."}
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}

                          <div className="border-t border-border pt-4">
                            <a
                              href={correctionHref}
                              className="inline-flex items-center gap-2 text-sm font-semibold text-[#970e24] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#970e24]/25 focus-visible:ring-offset-4"
                            >
                              <Mail className="h-4 w-4" aria-hidden="true" />
                              Report a name correction
                            </a>
                            <p className="mt-1 text-xs leading-5 text-muted-foreground">
                              Opens your email app with the Registry ID and current member name prefilled.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                    </div>
                  </div>
                </div>
,
                  document.body
                )}

              <p className="text-center text-xs text-muted-foreground">
                This public lookup does not expose personal contact details or document links.
              </p>
            </div>
          )}

        </div>
      </main>

      <div className="mt-auto border-t border-border/70">
        <RegistryFooter label="Public Verification Portal" />
      </div>

    </div>
  );
}
