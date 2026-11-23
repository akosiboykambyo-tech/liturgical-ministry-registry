import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ebGaramond } from "@/app/fonts";
import { OrdoPrintTrigger } from "@/components/ordo-print-trigger";
import { PublicMaintenanceGate } from "@/components/public-maintenance-gate";
import {
  APPROVED_READINGS,
  READING_LABELS,
  SOURCED_READING_EXAMPLES,
  type ReadingLanguage,
} from "@/lib/ordo-reading-data";
import "./print.css";

export const metadata: Metadata = {
  title: "Printable Mass Readings (Preview) | COWL-DOK",
  description:
    "A print-friendly COWL-DOK Ordo readings sheet. This preview is not an official published liturgical text.",
  robots: { index: false, follow: false },
};

type QueryValue = string | string[] | undefined;
type Props = {
  searchParams: Promise<{
    date?: QueryValue;
    lang?: QueryValue;
    parish?: QueryValue;
  }>;
};

function first(value: QueryValue): string {
  return typeof value === "string"
    ? value
    : Array.isArray(value) ? value[0] ?? "" : "";
}

function parseDate(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.toISOString().slice(0, 10) === value ? value : null;
}

function displayDate(value: string, language: ReadingLanguage): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat(language === "tl" ? "fil-PH" : "en-PH", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export default async function OrdoPrintPage({ searchParams }: Props) {
  const params = await searchParams;
  const date = parseDate(first(params.date));
  const language: ReadingLanguage = first(params.lang) === "tl" ? "tl" : "en";
  const labels = READING_LABELS[language];

  if (!date) {
    return (
      <main className="mx-auto max-w-[720px] px-6 py-14 text-[#1E1114]">
        <h1 className={ebGaramond.className + " text-[36px]"}>Date unavailable</h1>
        <p className="mt-4 text-[15px] leading-7">
          Choose a valid date from the Ordo calendar before opening the print view.
        </p>
        <Link href="/ordo" className="mt-4 inline-block text-[#0B5C5A] underline">
          Return to the Ordo
        </Link>
      </main>
    );
  }

  const approved = APPROVED_READINGS[date]?.[language];
  const approvedSections = approved ? [
    approved.firstReading,
    approved.responsorialPsalm,
    approved.secondReading,
    approved.gospel,
  ] : [];
  const hasApproved = approvedSections.some((reading) => Boolean(reading?.reference));
  const sourced = hasApproved ? undefined : SOURCED_READING_EXAMPLES[date]?.[language];
  const sections = [
    { key: "first", heading: labels.first, approved: hasApproved ? approved?.firstReading : undefined, reference: sourced?.first },
    { key: "psalm", heading: labels.psalm, approved: hasApproved ? approved?.responsorialPsalm : undefined, reference: sourced?.psalm },
    { key: "second", heading: labels.second, approved: hasApproved ? approved?.secondReading : undefined, reference: sourced?.second },
    { key: "gospel", heading: labels.gospel, approved: hasApproved ? approved?.gospel : undefined, reference: sourced?.gospel },
  ].filter((section) => Boolean(section.approved?.reference || section.reference));
  const available = sections.length > 0;
  const printedDate = displayDate(date, language);
  const isTagalog = language === "tl";

  return (
    <PublicMaintenanceGate>
      <div className="ordo-print-wrapper min-h-screen bg-[#F4ECEE] pb-12 text-[#1E1114]">
        <div className="ordo-print-toolbar mx-auto flex max-w-[790px] flex-col gap-3 px-5 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-0">
          <Link
            href="/ordo"
            className="inline-flex min-h-11 items-center text-[14px] font-semibold text-[#0B5C5A] underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B5C5A]"
          >
            {isTagalog ? "Bumalik sa Ordo" : "Back to the Ordo"}
          </Link>
          {available ? (
            <OrdoPrintTrigger language={language} />
          ) : (
            <span className="text-[13px] text-[#5F4A4F]">
              {isTagalog ? "Wala pang maaaring i-print." : "No readings available to print yet."}
            </span>
          )}
        </div>

        <main className="ordo-print-sheet mx-auto max-w-[790px] bg-white px-7 pb-12 pt-9 shadow-[0_18px_60px_-26px_rgba(58,0,16,0.32)] sm:px-12 sm:pb-16 sm:pt-12">
          <div className="ordo-print-masthead" role="banner">
            <Image
              src="/images/Asset_1.svg"
              alt="Roman Catholic Diocese of Kalookan — Commission on Worship and Liturgy"
              width={280}
              height={74}
              priority
              className="ordo-print-logo block h-auto w-[280px] max-w-full object-contain"
            />
          </div>

          <div className="ordo-print-rule mt-5 border-t-2 border-[#890022]" />
          <div className="pt-6 text-left" lang={isTagalog ? "tl" : "en"}>
            <h1 className={ebGaramond.className + " ordo-print-title text-[38px] font-medium leading-tight"}>
              {isTagalog ? "Mga Pagbasa sa Misa" : "Daily Mass Readings"}
            </h1>
            <p className="ordo-print-date mt-2 text-[16px] font-semibold">
              {printedDate}
            </p>
          </div>

          <div className="ordo-print-preview mt-7 border border-[#D2B8BC] px-4 py-3 text-center text-[12px] font-semibold leading-6 text-[#6F2438]">
            {isTagalog
              ? "PANIMULANG BERSYON LAMANG — Hindi pa ito opisyal na Ordo na inaprubahan ng COWL."
              : "DESIGN PREVIEW ONLY — Not an official COWL-approved Ordo."}
          </div>

          {available ? (
            <div className="ordo-print-readings mt-9" lang={isTagalog ? "tl" : "en"}>
              {sections.map((section) => (
                <section key={section.key} className="ordo-print-reading-section mb-10">
                  <h2 className="ordo-print-reading-heading border-b border-[#D9C5C9] pb-3 text-[14px] font-bold uppercase tracking-[0.09em] text-[#890022]">
                    {section.heading}
                  </h2>
                  <p className={ebGaramond.className + " ordo-print-reference mt-4 text-[24px] leading-snug"}>
                    {section.approved?.reference ?? section.reference}
                  </p>
                  {section.approved?.text && (
                    <div className="ordo-print-reading-text mt-4 whitespace-pre-wrap text-[18px] leading-[1.8] text-[#1E1114]">
                      {section.approved.text}
                    </div>
                  )}
                </section>
              ))}
            </div>
          ) : (
            <div className="ordo-print-empty mt-8 border border-[#E6DADC] px-5 py-8 text-center">
              <p className="text-[15px] font-semibold">
                {isTagalog ? "Hindi pa available ang mga pagbasa sa araw na ito." : "Readings are not available for this date yet."}
              </p>
              <p className="mt-2 text-[13px] leading-6 text-[#5F4A4F]">
                {isTagalog
                  ? "Bumalik sa Ordo para pumili ng isa pang araw. Huwag gamitin ang pahinang ito bilang opisyal na gabay sa Misa."
                  : "Return to the calendar to choose another date. Do not use this sheet as official Mass guidance."}
              </p>
            </div>
          )}

          {available && !hasApproved && (
            <div className="ordo-print-source mt-4 border-t border-[#E6DADC] pt-4 text-[12px] leading-6 text-[#5F4A4F]">
              <p className="font-semibold text-[#1E1114]">
                {isTagalog ? "Mga sanggunian lamang" : "Scripture references only"}
              </p>
              <p>
                {isTagalog
                  ? "Walang buong tekstong kinopya mula sa panlabas na website. Hindi pa beripikado ang mga pagdiriwang na naaayon sa parokya."
                  : "No full reading texts have been reproduced. Parish-specific observances and precedence remain unverified."}
              </p>
              {sourced && (
                <>
                  <p className="mt-2">{isTagalog ? "Pinagmulan" : "Source"}: {sourced.sourceName}</p>
                  <a href={sourced.sourceUrl} className="break-all text-[#0B5C5A] underline">
                    {sourced.sourceUrl}
                  </a>
                </>
              )}
            </div>
          )}

          {hasApproved && approved && (
            <div className="ordo-print-source mt-4 border-t border-[#E6DADC] pt-4 text-[12px] leading-6 text-[#5F4A4F]">
              <p>{isTagalog ? "Pinagmulan" : "Source"}: {approved.source}</p>
              <p>{approved.permissionNotice}</p>
            </div>
          )}

          <footer className="ordo-print-footer" aria-label="Ordo print footer">
            <span className="ordo-print-footer-brand">COWL-DOK · ORDO</span>
          </footer>
        </main>
      </div>
    </PublicMaintenanceGate>
  );
}
