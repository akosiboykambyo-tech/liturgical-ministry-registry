"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle,
  Check,
  Clock,
  Download,
  Loader2,
  MinusCircle,
  Printer,
  Search,
  X,
} from "lucide-react";

import { ebGaramond } from "@/app/fonts";
import { CertificateDesign } from "@/components/certificate-design";
import type { CertificateDesignHandle } from "@/components/certificate-design";
import { NameCorrectionForm } from "@/components/name-correction-form";
import { RegistryFooter } from "@/components/registry-footer";
import { PublicMaintenanceGate } from "@/components/public-maintenance-gate";
import { RegistryHeader } from "@/components/registry-header";
import { VerificationResultSelector } from "@/components/verification-result-selector";
import { DEFAULT_TEMPLATE_SETTINGS, getExpirationStatus } from "@/lib/constants";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type {
  CertificateTemplateSettings,
  Member,
  MemberMinistry,
  Signatory,
} from "@/lib/types";
import {
  formatPublicDate,
  getMembershipPublicStatus,
  getRecordPublicStatus,
  isCurrentMembership,
  shortPublicMinistry,
} from "@/lib/verification-public-status";

export default function VerifyPageWrapper() {
  return (
    <PublicMaintenanceGate>
      <Suspense fallback={<LoadingState />}>
        <VerifyPage />
      </Suspense>
    </PublicMaintenanceGate>
  );
}

function LoadingState() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-screen items-center justify-center bg-[#FBF9F9]"
    >
      <Loader2 className="h-6 w-6 animate-spin text-[#970E24]" aria-hidden="true" />
      <span className="sr-only">Loading registry lookup...</span>
    </div>
  );
}

type PublicMembership = Pick<
  MemberMinistry,
  "id" | "member_id" | "ministry" | "status" | "expiration_date"
>;

interface PublicMember
  extends Pick<
    Member,
    | "id"
    | "first_name"
    | "last_name"
    | "parish"
    | "ministries"
    | "status"
    | "service_year"
    | "expiration_date"
  > {
  uid?: string;
  member_ministries: PublicMembership[];
}

const TOO_MANY_MATCHES = 8;

function VerifyPage() {
  const supabase = getSupabaseBrowserClient();
  const params = useSearchParams();
  const initialQuery = params.get("uid") ?? params.get("q") ?? "";
  const printParam = params.get("print") === "1";

  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<PublicMember[]>([]);
  const [settings, setSettings] =
    useState<CertificateTemplateSettings | null>(null);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchedByUid, setSearchedByUid] = useState(false);
  const [signatories, setSignatories] = useState<Signatory[]>([]);
  const [selectedMinistry, setSelectedMinistry] = useState<string | null>(null);
  const [downloadCount, setDownloadCount] = useState(0);
  const [generating, setGenerating] = useState(false);

  const [activeResultIndex, setActiveResultIndex] = useState(0);
  const [parishFilter, setParishFilter] = useState("");
  const [showAllParishes, setShowAllParishes] = useState(false);

  const [detailsMounted, setDetailsMounted] = useState(false);
  const [detailsVisible, setDetailsVisible] = useState(false);
  const [correctionMode, setCorrectionMode] = useState(false);
  const [detailContentVisible, setDetailContentVisible] = useState(true);

  const detailsCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const detailContentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const certRef = useRef<CertificateDesignHandle>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("system_settings")
        .select("*")
        .like("key", "certificate_template%")
        .eq("is_default", true)
        .maybeSingle();

      setSettings(
        data?.value
          ? (data.value as CertificateTemplateSettings)
          : DEFAULT_TEMPLATE_SETTINGS
      );

      const { data: sigData } = await supabase
        .from("signatories")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");

      setSignatories((sigData as Signatory[]) ?? []);
    })();
  }, [supabase]);

  const doSearch = useCallback(
    async (raw: string) => {
      const term = raw.trim();

      setSearching(true);
      setError(null);
      setResults([]);
      setSearched(true);
      setParishFilter("");
      setShowAllParishes(false);
      setActiveResultIndex(0);

      if (!term) {
        setSearching(false);
        setSearched(false);
        setSearchedByUid(false);
        setError("Enter a full name or Registry ID.");
        return;
      }

      try {
        const response = await fetch("/api/verify", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          cache: "no-store",
          body: JSON.stringify({ query: term }),
        });

        const data = (await response.json()) as {
          error?: string;
          results?: PublicMember[];
          searchedByUid?: boolean;
        };

        if (!response.ok) {
          setError(data.error ?? "Verification is unavailable.");
          setSearchedByUid(false);
          return;
        }

        setResults(data.results ?? []);
        setSearchedByUid(Boolean(data.searchedByUid));
      } catch {
        setError("We could not complete the lookup. Please try again.");
        setSearchedByUid(false);
      } finally {
        setSearching(false);
      }
    },
    []
  );

  useEffect(() => {
    if (initialQuery) {
      setQuery(initialQuery);
      void doSearch(initialQuery);
    }
  }, [initialQuery, doSearch]);

  const parishCounts = useMemo(() => {
    const counts = new Map<string, number>();

    for (const member of results) {
      counts.set(member.parish, (counts.get(member.parish) ?? 0) + 1);
    }

    return Array.from(counts.entries()).sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    });
  }, [results]);

  const filteredResults = useMemo(() => {
    if (!parishFilter) return results;
    return results.filter((member) => member.parish === parishFilter);
  }, [parishFilter, results]);

  useEffect(() => {
    setActiveResultIndex(0);
  }, [parishFilter]);

  const activeMember =
    filteredResults[activeResultIndex] ?? filteredResults[0] ?? null;

  const switchDetailContent = useCallback((nextCorrectionMode: boolean) => {
    setDetailContentVisible(false);

    if (detailContentTimerRef.current) {
      clearTimeout(detailContentTimerRef.current);
    }

    detailContentTimerRef.current = setTimeout(() => {
      setCorrectionMode(nextCorrectionMode);
      requestAnimationFrame(() => setDetailContentVisible(true));
      detailContentTimerRef.current = null;
    }, 140);
  }, []);

  const openDetails = useCallback(() => {
    setCorrectionMode(false);
    setDetailContentVisible(true);

    if (detailsCloseTimerRef.current) {
      clearTimeout(detailsCloseTimerRef.current);
    }

    setDetailsMounted(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setDetailsVisible(true));
    });
  }, []);

  const closeDetails = useCallback(() => {
    setDetailsVisible(false);

    if (detailsCloseTimerRef.current) {
      clearTimeout(detailsCloseTimerRef.current);
    }

    detailsCloseTimerRef.current = setTimeout(() => {
      setDetailsMounted(false);
      setCorrectionMode(false);
      setDetailContentVisible(true);
      detailsCloseTimerRef.current = null;
    }, 200);
  }, []);

  useEffect(() => {
    if (!detailsMounted) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDetails();
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [closeDetails, detailsMounted]);

  useEffect(() => {
    return () => {
      if (detailsCloseTimerRef.current) clearTimeout(detailsCloseTimerRef.current);
      if (detailContentTimerRef.current) clearTimeout(detailContentTimerRef.current);
    };
  }, []);

  useEffect(() => {
    setDownloadCount(0);

    if (!activeMember) {
      setSelectedMinistry(null);
      return;
    }

    const preferred =
      activeMember.member_ministries.find((membership) => {
        const expiration = getExpirationStatus(membership.expiration_date);
        return (
          (membership.status === "New" || membership.status === "Renewed") &&
          expiration !== "expired" &&
          expiration !== "expiring_soon"
        );
      }) ?? activeMember.member_ministries[0];

    setSelectedMinistry(preferred?.ministry ?? null);
  }, [activeMember]);

  const membershipIsEligible = (membership: PublicMembership) => {
    const expiration = getExpirationStatus(membership.expiration_date);

    return (
      (membership.status === "New" || membership.status === "Renewed") &&
      expiration !== "expired" &&
      expiration !== "expiring_soon"
    );
  };

  const reprintSuffix =
    downloadCount > 0 ? `-R${downloadCount + 1}` : "";

  const waitForCertificateRender = () =>
    new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });

  const membershipIsEligibleForIssuance = (
    membership: PublicMembership
  ) => membershipIsEligible(membership);

  const allocateIssuance = async (
    registryId: string,
    membership: PublicMembership
  ): Promise<number> => {
    const response = await fetch("/api/certificates/issue", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
      body: JSON.stringify({
        registryId,
        memberMinistryId: membership.id,
      }),
    });

    const result = (await response.json()) as {
      issuanceNumber?: number;
      reprintSuffix?: string;
      error?: string;
    };

    if (!response.ok) {
      throw new Error(
        result.error ?? "Certificate issuance failed."
      );
    }

    if (
      !Number.isSafeInteger(result.issuanceNumber) ||
      !result.issuanceNumber ||
      result.issuanceNumber < 1
    ) {
      throw new Error("Invalid certificate issuance number.");
    }

    return result.issuanceNumber;
  };

  const prepareCertificateMembership = async (
    membership: PublicMembership
  ) => {
    setSelectedMinistry(membership.ministry);
    setDownloadCount(0);
    await waitForCertificateRender();

    const canvas = await certRef.current?.render();

    if (!canvas) {
      throw new Error("Certificate could not be prepared.");
    }
  };

  const applyIssuanceNumber = async (number: number) => {
    setDownloadCount(number - 1);
    await waitForCertificateRender();
  };

  const handleDownload = async (membership: PublicMembership) => {
    const member = results[0];

    if (!member?.uid || !settings || !searchedByUid) return;
    if (!membershipIsEligibleForIssuance(membership)) return;
    if (generating) return;

    setGenerating(true);
    setError(null);

    try {
      // Prepare the certificate before allocating a number.
      await prepareCertificateMembership(membership);

      // Atomically allocate the next issuance number.
      const issuanceNumber = await allocateIssuance(
        member.uid,
        membership
      );


      const suffix =
        issuanceNumber === 1 ? "" : `-R${issuanceNumber}`;

      await certRef.current?.download(
        `certificate-${member.uid}${suffix}.png`,
        suffix
      );
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Certificate download failed."
      );
    } finally {
      setGenerating(false);
    }
  };

  const handlePrint = async (membership: PublicMembership) => {
    const member = results[0];

    if (!member?.uid || !settings || !searchedByUid) return;
    if (!membershipIsEligibleForIssuance(membership)) return;
    if (generating) return;

    const printWindow = window.open(
      "",
      "_blank",
      "width=900,height=1000"
    );

    if (!printWindow) {
      setError("Allow pop-ups to print the certificate.");
      return;
    }

    setGenerating(true);
    setError(null);

    try {
      // Confirm that rendering works before allocating.
      await prepareCertificateMembership(membership);

      const issuanceNumber = await allocateIssuance(
        member.uid,
        membership
      );

      const suffix =
        issuanceNumber === 1 ? "" : `-R${issuanceNumber}`;

      // Render again with the allocated reprint suffix.
      const canvas = await certRef.current?.render(suffix);

      if (!canvas) {
        throw new Error("Certificate could not be rendered.");
      }

      const png = canvas.toDataURL("image/png");

      printWindow.document.open();
      printWindow.document.write(`
        <!doctype html>
        <html>
          <head>
            <title>Certificate - ${member.uid}</title>
            <style>
              @page { size: Letter portrait; margin: 0; }
              html, body {
                width: 8.5in;
                height: 11in;
                margin: 0;
                padding: 0;
                background: white;
                overflow: hidden;
              }
              body {
                display: flex;
                align-items: center;
                justify-content: center;
              }
              img {
                width: 8.5in;
                height: 11in;
                object-fit: contain;
              }
            </style>
          </head>
          <body>
            <img src="${png}" alt="Official certificate" />
          </body>
        </html>
      `);
      printWindow.document.close();

      const image = printWindow.document.querySelector("img");

      const print = () => {
        printWindow.focus();
        printWindow.print();
      };

      if (image?.complete) {
        print();
      } else if (image) {
        image.onload = print;
      }
    } catch (error) {
      printWindow.close();

      setError(
        error instanceof Error
          ? error.message
          : "Certificate printing failed."
      );
    } finally {
      setGenerating(false);
    }
  };
  const recordStatus = activeMember
    ? getRecordPublicStatus(activeMember.member_ministries)
    : null;

  const statusColor =
    recordStatus?.kind === "registered"
      ? "text-[#0B5C5A]"
      : recordStatus?.kind === "pending"
      ? "text-[#3B5278]"
      : recordStatus?.kind === "ended"
      ? "text-[#7A4E00]"
      : "text-[#5F4A4F]";

  const checkedToday = new Date().toLocaleDateString("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="min-h-screen bg-[#FBF9F9] text-[#1E1114]">
      {!printParam && <RegistryHeader current="verify" />}

      <main className={printParam ? "" : "min-h-[60vh]"}>
        {!printParam && (
          <section className="bg-[#890022] text-white">
            <div className="mx-auto w-full max-w-[1120px] px-6 py-8 sm:px-8 lg:px-0 lg:py-10">
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void doSearch(query);
                }}
              >
                <label
                  htmlFor="member-search"
                  className={`${ebGaramond.className} text-[14px] font-medium uppercase tracking-[0.16em] text-[#F3C6D0]`}
                >
                  Full name or Registry ID
                </label>

                <div className="mt-2 flex flex-col gap-3 sm:flex-row">
                  <input
                    id="member-search"
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      if (!event.target.value.trim()) {
                        setResults([]);
                        setSearched(false);
                        setError(null);
                        setParishFilter("");
                      }
                    }}
                    placeholder="Name or Registry ID"
                    aria-invalid={Boolean(error)}
                    className="min-h-14 flex-1 rounded-[3px] border-0 bg-white px-5 text-[17px] text-[#1E1114] outline-none placeholder:text-[#7A6C70] focus-visible:ring-2 focus-visible:ring-white/85"
                  />

                  <button
                    type="submit"
                    disabled={searching}
                    className="min-h-14 shrink-0 rounded-[3px] bg-[#3A0010] px-8 text-[16px] font-semibold text-white transition-colors hover:bg-[#26000A] disabled:opacity-60"
                  >
                    {searching ? "Looking up…" : "Look up"}
                  </button>
                </div>

                <p className="mt-3 text-[14px] leading-6 text-[#F3C6D0]">
                  Registry IDs look like LMD-2026-K7M9-Q2RX-T5WA.{" "}
                  <span className="font-semibold text-white">
                    Have a certificate? Scan its QR code
                  </span>{" "}
                  with your phone&apos;s camera.
                </p>
              </form>
            </div>
          </section>
        )}

        {results.length === 1 && results[0].uid && settings && (
          <CertificateDesign
            ref={certRef}
            settings={settings}
            data={{
              firstName: results[0].first_name,
              lastName: results[0].last_name,
              parish: results[0].parish,
              ministries: results[0].member_ministries.map(
                (membership) => membership.ministry
              ),
              uid: results[0].uid,
              liturgicalYear: settings.liturgical_year,
              verifyUrl: `${
                typeof window !== "undefined" ? window.location.origin : ""
              }/verify?uid=${results[0].uid}`,
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

        {!printParam && (
          <section className="mx-auto w-full max-w-[1120px] px-6 py-12 sm:px-8 lg:px-0 lg:py-14">
            {searching && (
              <div className="py-14 text-center" role="status">
                <Loader2 className="mx-auto h-6 w-6 animate-spin text-[#970E24]" />
                <p className="mt-3 text-[15px] text-[#5F4A4F]">
                  Looking up the registry…
                </p>
              </div>
            )}

            {!searching && error && (
              <div
                role="alert"
                className="border-l-4 border-[#B00020] bg-[#FBEFEF] px-5 py-4 text-[15px] text-[#75101F]"
              >
                {error}
              </div>
            )}

            {!searching && searched && results.length === 0 && !error && (
              <div className="max-w-[700px]">
                <h1
                  className={`${ebGaramond.className} text-[40px] font-medium leading-tight sm:text-[48px]`}
                >
                  No result for “{query.trim()}”
                </h1>
                <p className="mt-4 text-[17px] leading-8 text-[#5F4A4F]">
                  Check the spelling or try the full Registry ID. If the
                  registration is recent, it may still be under review.
                </p>
              </div>
            )}

            {!searching &&
              results.length > TOO_MANY_MATCHES &&
              !parishFilter && (
                <div className="max-w-[760px]">
                  <h1
                    className={`${ebGaramond.className} text-[42px] font-medium leading-tight sm:text-[50px]`}
                  >
                    {results.length} people match “{query.trim()}”
                  </h1>
                  <p className="mt-3 max-w-[690px] text-[17px] leading-8 text-[#5F4A4F]">
                    That is too many to show at once. Enter their full name or
                    Registry ID above, or narrow by parish below.
                  </p>

                  <div className="mt-10 border-t-[4px] border-[#970E24]">
                    <p
                      className={`${ebGaramond.className} border-b border-[#E6DADC] py-4 text-[14px] font-medium uppercase tracking-[0.16em] text-[#5F4A4F]`}
                    >
                      Narrow by parish
                    </p>

                    {(showAllParishes
                      ? parishCounts
                      : parishCounts.slice(0, 5)
                    ).map(([parish, count]) => (
                      <button
                        key={parish}
                        type="button"
                        onClick={() => setParishFilter(parish)}
                        className="flex min-h-14 w-full items-center justify-between gap-6 border-b border-[#E6DADC] py-3 text-left text-[16px] hover:text-[#970E24]"
                      >
                        <span>{parish}</span>
                        <span
                          className={`${ebGaramond.className} text-[20px] italic text-[#970E24]`}
                        >
                          {count}
                        </span>
                      </button>
                    ))}

                    {parishCounts.length > 5 && !showAllParishes && (
                      <button
                        type="button"
                        onClick={() => setShowAllParishes(true)}
                        className="mt-4 text-[15px] font-semibold text-[#0B5C5A] underline underline-offset-3"
                      >
                        Show {parishCounts.length - 5} more parishes
                      </button>
                    )}
                  </div>

                  <p
                    className={`${ebGaramond.className} mt-10 max-w-[720px] text-[26px] italic leading-9 text-[#5F4A4F]`}
                  >
                    Not sure which one? Ask the person for their certificate and
                    scan its QR code.
                  </p>
                  <p className="mt-3 text-[14px] leading-6 text-[#5F4A4F]">
                    This lookup shows names, parishes and ministries only. No
                    contact details are shown.
                  </p>
                </div>
              )}

            {!searching &&
              filteredResults.length > 0 &&
              (results.length <= TOO_MANY_MATCHES || parishFilter) && (
                <div>
                  <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <h1
                        className={`${ebGaramond.className} text-[42px] font-medium leading-tight sm:text-[50px]`}
                      >
                        {filteredResults.length}{" "}
                        {filteredResults.length === 1 ? "result" : "results"} for
                        “{query.trim()}”
                      </h1>
                      <p className="mt-2 text-[17px] leading-7 text-[#5F4A4F]">
                        Sorted A to Z. Use the arrows to move through them, or
                        narrow by parish.
                      </p>
                    </div>

                    {results.length > 1 && (
                      <div className="w-full sm:w-[210px]">
                        <label
                          htmlFor="parish-filter"
                          className={`${ebGaramond.className} text-[14px] font-medium uppercase tracking-[0.16em] text-[#5F4A4F]`}
                        >
                          Parish
                        </label>
                        <select
                          id="parish-filter"
                          value={parishFilter}
                          onChange={(event) =>
                            setParishFilter(event.target.value)
                          }
                          className="mt-2 min-h-12 w-full border border-[#CDBFC2] bg-white px-4 text-[15px]"
                        >
                          <option value="">All parishes</option>
                          {parishCounts.map(([parish]) => (
                            <option key={parish} value={parish}>
                              {parish}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  <div className="mt-8">
                    <VerificationResultSelector
                      results={filteredResults}
                      activeIndex={activeResultIndex}
                      onChange={setActiveResultIndex}
                      onViewDetails={openDetails}
                      hideControls={detailsMounted}
                    />
                  </div>

                  <p
                    className={`${ebGaramond.className} mt-10 max-w-[740px] text-[26px] italic leading-9 text-[#5F4A4F]`}
                  >
                    Not sure which one? Ask the person for their certificate and
                    scan its QR code.
                  </p>
                  <p className="mt-3 text-[14px] leading-6 text-[#5F4A4F]">
                    This lookup shows names, parishes and ministries only. No
                    contact details are shown.
                  </p>
                </div>
              )}
          </section>
        )}
      </main>

      {!printParam && <RegistryFooter />}

      {detailsMounted &&
        activeMember &&
        recordStatus &&
        createPortal(
          <div
            className={[
              "fixed inset-0 z-[5000] flex bg-black/60 transition-opacity duration-200 md:items-center md:justify-center md:p-6",
              detailsVisible ? "opacity-100" : "opacity-0",
            ].join(" ")}
            role="dialog"
            aria-modal="true"
            aria-labelledby="record-title"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) closeDetails();
            }}
          >
            <div
              className={[
                "mt-auto flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-[14px] bg-white transition-transform duration-200 md:mt-0 md:max-w-[760px] md:rounded-[12px]",
                detailsVisible
                  ? "translate-y-0"
                  : "translate-y-5 md:translate-y-3",
              ].join(" ")}
            >
              <div className="flex items-start justify-between gap-5 px-6 pb-5 pt-6 sm:px-8 sm:pt-7">
                <div className="min-w-0">
                  <h2
                    id="record-title"
                    className={`${ebGaramond.className} text-[36px] font-medium leading-none tracking-[-0.02em] sm:text-[44px]`}
                  >
                    {activeMember.first_name} {activeMember.last_name}
                  </h2>
                  <p className="mt-3 text-[16px] font-semibold leading-6">
                    {activeMember.parish}
                    {searchedByUid && (
                      <span className="font-normal text-[#5F4A4F]">
                        {" "}
                        · Registry ID {activeMember.uid}
                      </span>
                    )}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeDetails}
                  aria-label="Close record"
                  className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-[#D7CACC] text-[#1E1114]"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div
                className={[
                  "overflow-y-auto transition-[opacity,transform] duration-150",
                  detailContentVisible
                    ? "translate-y-0 opacity-100"
                    : "translate-y-2 opacity-0",
                ].join(" ")}
              >
                {correctionMode ? (
                  <div className="px-5 pb-6 sm:px-8">
                    <NameCorrectionForm
                      member={{
                        memberId: activeMember.id,
                        registryId: activeMember.uid ?? "",
                        currentName: `${activeMember.first_name} ${activeMember.last_name}`,
                        parish: activeMember.parish,
                      }}
                      onCancel={() => switchDetailContent(false)}
                    />
                  </div>
                ) : (
                  <>
                    <div
                      className={[
                        "flex items-center gap-3 border-y border-[#E6DADC] bg-[#F2F8F7] px-6 py-5 sm:px-8",
                        statusColor,
                      ].join(" ")}
                    >
                      {recordStatus.kind === "registered" ? (
                        <Check className="h-7 w-7 shrink-0" />
                      ) : recordStatus.kind === "pending" ? (
                        <Clock className="h-7 w-7 shrink-0" />
                      ) : recordStatus.kind === "ended" ? (
                        <Clock className="h-7 w-7 shrink-0" />
                      ) : (
                        <MinusCircle className="h-7 w-7 shrink-0" />
                      )}
                      <p className="text-[18px] sm:text-[20px]">
                        <span className="font-semibold">{recordStatus.label}</span>
                        <span className="ml-3 font-normal text-[#5F4A4F]">
                          Checked on {checkedToday}
                        </span>
                      </p>
                    </div>

                    <div className="px-6 py-6 sm:px-8">
                      <h3
                        className={`${ebGaramond.className} text-[30px] font-medium leading-none`}
                      >
                        Ministries
                      </h3>

                      <div className="mt-4 border-t border-[#E6DADC]">
                        {activeMember.member_ministries.map((membership) => {
                          const publicStatus =
                            getMembershipPublicStatus(membership);
                          const eligible = membershipIsEligible(membership);

                          return (
                            <div
                              key={membership.id}
                              className="border-b border-[#E6DADC] py-4"
                            >
                              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                  <p className="text-[16px] font-semibold">
                                    {shortPublicMinistry(membership.ministry)}
                                  </p>
                                  <p className="mt-1 text-[15px] text-[#5F4A4F]">
                                    {publicStatus.kind === "registered"
                                      ? publicStatus.validity
                                      : publicStatus.label}
                                  </p>
                                </div>

                                {searchedByUid &&
                                  eligible &&
                                  settings && (
                                    <div className="flex flex-col gap-2 sm:flex-row">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          void handleDownload(membership)
                                        }
                                        disabled={generating}
                                        aria-label={`Download certificate, ${shortPublicMinistry(
                                          membership.ministry
                                        )}`}
                                        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[3px] bg-[#970E24] px-5 text-[15px] font-semibold text-white disabled:opacity-60"
                                      >
                                        <Download className="h-4 w-4" />
                                        Download
                                      </button>

                                      <button
                                        type="button"
                                        onClick={() =>
                                          void handlePrint(membership)
                                        }
                                        disabled={generating}
                                        aria-label={`Print certificate, ${shortPublicMinistry(
                                          membership.ministry
                                        )}`}
                                        className="hidden min-h-12 items-center justify-center gap-2 rounded-[3px] border border-[#A89197] bg-white px-5 text-[15px] font-semibold disabled:opacity-60 md:inline-flex"
                                      >
                                        <Printer className="h-4 w-4" />
                                        Print
                                      </button>
                                    </div>
                                  )}

                                {searchedByUid &&
                                  !eligible && (
                                    <p className="text-[14px] text-[#5F4A4F]">
                                      No certificate available
                                    </p>
                                  )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {!searchedByUid &&
                        activeMember.member_ministries.some(
                          isCurrentMembership
                        ) && (
                          <p
                            className={`${ebGaramond.className} mt-6 text-[22px] italic leading-8 text-[#5F4A4F]`}
                          >
                            Want the certificate? Search again with their Registry ID
                          </p>
                        )}

                      <p className="mt-5 text-[16px]">
                        Something wrong?{" "}
                        <Link
                          href={`/report?memberId=${encodeURIComponent(
                            activeMember.id
                          )}&registryId=${encodeURIComponent(activeMember.uid ?? "")}&name=${encodeURIComponent(
                            `${activeMember.first_name} ${activeMember.last_name}`
                          )}&parish=${encodeURIComponent(activeMember.parish)}`}
                          className="font-semibold text-[#0B5C5A] underline underline-offset-3"
                        >
                          Report a correction
                        </Link>
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
