"use client";

import { useState } from "react";
import { ebGaramond } from "@/app/fonts";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
} from "@/components/phosphor-icons";
import { PARISHES } from "@/lib/constants";

type LiturgicalColor = "green" | "white" | "violet" | "red";
type PreviewEntry = {
  title: string;
  rank: string;
  season: string;
  color: LiturgicalColor;
  note: string;
};
type LocalReference = {
  title: string;
  appliesTo: string;
  note: string;
};

/**
 * Design-stage examples only, NOT an approved, complete diocesan Ordo.
 * Replace this with approved, year-specific records from the Ordo service.
 * Do not derive parish observances or precedence from fixed dates alone.
 */
const NATIONAL_EXAMPLES: Record<string, PreviewEntry> = {
  "2026-11-19": {
    title: "Thursday of the 33rd Week in Ordinary Time",
    rank: "Weekday",
    season: "Ordinary Time",
    color: "green",
    note: "Example national calendar entry. Mass readings and rubrics await the approved Philippine Ordo.",
  },
  "2026-11-22": {
    title: "Our Lord Jesus Christ, King of the Universe",
    rank: "Solemnity",
    season: "Ordinary Time",
    color: "white",
    note: "Example for the solemnity of Christ the King. Local instructions and readings have not been published here.",
  },
  "2026-11-29": {
    title: "First Sunday of Advent",
    rank: "Sunday",
    season: "Advent",
    color: "violet",
    note: "Example opening of the new liturgical year. Parish-specific details require COWL review.",
  },
};

const COLOR_DETAILS: Record<LiturgicalColor, { label: string; hex: string }> = {
  green: { label: "Green", hex: "#287C46" },
  white: { label: "White / gold", hex: "#E6C779" },
  violet: { label: "Violet", hex: "#7F55A1" },
  red: { label: "Red", hex: "#B33039" },
};

const LOCAL_REFERENCE_DATES = [
  { month: 8, day: 16, label: "Saint Roch", detail: "Diocesan patronal celebration" },
  { month: 12, day: 12, label: "Cathedral dedication", detail: "Anniversary of the cathedral's dedication" },
];

function todayInManila(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return [value("year"), value("month"), value("day")].join("-");
}

function makeDate(year: number, month: number, day: number): string {
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
}

function formatDate(date: string, options: Intl.DateTimeFormatOptions): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "UTC",
    ...options,
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  return makeDate(year, month, day) === value;
}

function localReferences(date: string, parish: string): LocalReference[] {
  const monthDay = date.slice(5);
  const result: LocalReference[] = [];

  if (monthDay === "08-16") {
    result.push({
      title: "Saint Roch (San Roque)",
      appliesTo: "Diocese of Kalookan",
      note: "Patronal date reference. The year's actual observance, local rank, and precedence require COWL approval.",
    });
    if (parish === "San Roque Cathedral Parish") {
      result.push({
        title: "San Roque Cathedral patronal celebration",
        appliesTo: parish,
        note: "Cathedral-specific observance to be confirmed against the approved proper calendar.",
      });
    }
  }

  if (monthDay === "12-12") {
    result.push({
      title: "Anniversary of the dedication of San Roque Cathedral",
      appliesTo: "Diocese of Kalookan",
      note: "Local date reference only. The applicable rank and any conflicting celebration must be resolved by COWL.",
    });
  }

  if (monthDay === "08-24" && parish === "San Bartolome Parish") {
    result.push({
      title: "Saint Bartholomew, Apostle",
      appliesTo: parish,
      note: "Illustrative parish titular entry; the parish's actual celebration and rank have not been approved in this preview.",
    });
  }

  return result;
}

function ColorMarker({ color }: { color: LiturgicalColor }) {
  const item = COLOR_DETAILS[color];
  return (
    <span className="inline-flex items-center gap-2 text-[13px] text-[#5F4A4F]">
      <span
        className="h-3 w-3 shrink-0 rounded-full border border-black/15"
        style={{ backgroundColor: item.hex }}
        aria-hidden="true"
      />
      {item.label}
    </span>
  );
}

export function OrdoCalendar() {
  const [selectedDate, setSelectedDate] = useState<string>(todayInManila);
  const [parish, setParish] = useState("");
  const today = todayInManila();
  const [year, month] = selectedDate.split("-").map(Number);
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const visibleDays = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
  const cells = Array.from({ length: visibleDays }, (_, index) => {
    const day = index - firstWeekday + 1;
    return day >= 1 && day <= daysInMonth ? day : null;
  });
  const example = NATIONAL_EXAMPLES[selectedDate];
  const local = localReferences(selectedDate, parish);

  const shiftMonth = (offset: number) => {
    const start = new Date(Date.UTC(year, month - 1 + offset, 1));
    setSelectedDate(makeDate(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  };

  const goToLocalDate = (monthNumber: number, day: number) => {
    setSelectedDate(makeDate(year, monthNumber, day));
  };

  return (
    <>
      <section className="bg-[#890022] text-white">
        <div className="mx-auto grid w-full max-w-[1120px] gap-9 px-6 py-14 sm:px-8 sm:py-16 lg:grid-cols-[1fr_300px] lg:items-end lg:gap-12 lg:px-0 lg:py-20">
          <div>
            <p className={ebGaramond.className + " text-[27px] italic leading-tight text-[#F3C6D0] sm:text-[34px]"}>
              A calendar for our shared worship
            </p>
            <h1 className={ebGaramond.className + " mt-2 text-[58px] font-medium leading-[0.95] tracking-[-0.035em] sm:text-[76px] lg:text-[92px]"}>
              The Ordo
            </h1>
            <p className="mt-6 max-w-[630px] text-[17px] leading-8 text-white/90">
              Explore the liturgical calendar, important diocesan observances,
              and celebrations proper to each parish in Kalookan, Malabon, and Navotas.
            </p>
          </div>
          <div className="border-t border-white/30 pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#F3C6D0]">
              Calendar for
            </p>
            <p className={ebGaramond.className + " mt-2 text-[29px] leading-tight"}>
              Diocese of Kalookan
            </p>
            <p className="mt-3 text-[14px] leading-6 text-white/75">
              A proposed digital companion to the Philippine Ordo and approved
              diocesan guidance.
            </p>
          </div>
        </div>
      </section>

      <main id="ordo-main">
        <div className="mx-auto w-full max-w-[1120px] px-6 pt-8 sm:px-8 lg:px-0">
          <div className="flex items-start gap-3 border-l-4 border-[#7A4E00] bg-[#F7F0E5] px-4 py-4 text-[#4A3519]" role="note">
            <FileText className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <div className="text-[14px] leading-6">
              <strong className="font-semibold">Design preview — not an official Ordo.</strong>{" "}
              Only a few example days are populated. Parish celebrations are
              reference markers, not approved instructions. Do not use this page
              to choose Mass texts, readings, or vestments until COWL publishes
              the validated calendar.
            </div>
          </div>
        </div>

        <section aria-label="Explore the Ordo" className="mx-auto w-full max-w-[1120px] px-6 pb-14 pt-9 sm:px-8 lg:px-0 lg:pb-20 lg:pt-12">
          <div className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#890022]">
                Calendar explorer
              </p>
              <h2 className={ebGaramond.className + " mt-1 text-[37px] font-medium leading-tight sm:text-[44px]"}>
                Find a liturgical day
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setSelectedDate(todayInManila())}
              className="inline-flex min-h-11 items-center justify-center self-start border border-[#970E24] px-5 text-[14px] font-semibold text-[#890022] hover:bg-[#F7E9ED] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#970E24]"
            >
              Go to today
            </button>
          </div>

          <div className="mb-6 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div>
              <label htmlFor="ordo-parish" className="mb-2 block text-[14px] font-semibold text-[#1E1114]">
                Calendar scope
              </label>
              <select
                id="ordo-parish"
                value={parish}
                onChange={(event) => setParish(event.target.value)}
                className="min-h-12 w-full border border-[#C8B8BB] bg-white px-3 text-[15px] text-[#1E1114] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#970E24]"
              >
                <option value="">Diocesan calendar · all parishes</option>
                {PARISHES.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="ordo-date" className="mb-2 block text-[14px] font-semibold text-[#1E1114]">
                Jump to date
              </label>
              <input
                id="ordo-date"
                type="date"
                value={selectedDate}
                onChange={(event) => {
                  if (isValidDate(event.target.value)) setSelectedDate(event.target.value);
                }}
                className="min-h-12 w-full border border-[#C8B8BB] bg-white px-3 text-[15px] text-[#1E1114] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#970E24]"
              />
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.18fr)_minmax(0,0.82fr)] lg:items-start">
            <section aria-label="Month calendar" className="border border-[#E6DADC] bg-white p-4 shadow-[0_12px_32px_-28px_rgba(58,0,16,0.55)] sm:p-6">
              <div className="mb-6 flex items-center justify-between gap-2">
                <h3 className={ebGaramond.className + " text-[29px] font-medium sm:text-[33px]"}>
                  {formatDate(makeDate(year, month, 1), { month: "long", year: "numeric" })}
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => shiftMonth(-1)}
                    aria-label="Previous month"
                    className="grid h-11 w-11 place-items-center border border-[#E6DADC] text-[#890022] hover:bg-[#F7E9ED] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#970E24]"
                  >
                    <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => shiftMonth(1)}
                    aria-label="Next month"
                    className="grid h-11 w-11 place-items-center border border-[#E6DADC] text-[#890022] hover:bg-[#F7E9ED] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#970E24]"
                  >
                    <ChevronRight className="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-7 gap-1" aria-hidden="true">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => (
                  <div key={label} className="py-2 text-center text-[11px] font-semibold uppercase tracking-[0.04em] text-[#5F4A4F] sm:text-[12px]">
                    {label}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {cells.map((day, index) => {
                  if (day === null) return <span key={"empty-" + index} aria-hidden="true" className="min-h-12 sm:min-h-[70px]" />;
                  const date = makeDate(year, month, day);
                  const sample = Boolean(NATIONAL_EXAMPLES[date]);
                  const hasLocal = localReferences(date, parish).length > 0;
                  const selected = date === selectedDate;
                  const isToday = date === today;
                  return (
                    <button
                      key={date}
                      type="button"
                      onClick={() => setSelectedDate(date)}
                      aria-label={formatDate(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) + (sample ? ", example entry" : "") + (hasLocal ? ", local reference" : "")}
                      aria-pressed={selected}
                      aria-current={isToday ? "date" : undefined}
                      className={[
                        "flex min-h-12 flex-col items-center justify-center gap-1 border px-1 py-2 text-[14px] font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#970E24] sm:min-h-[70px] sm:text-[16px]",
                        selected ? "border-[#890022] bg-[#890022] text-white" : "border-transparent bg-[#FBF9F9] text-[#1E1114] hover:border-[#D1A4B0] hover:bg-[#F7E9ED]",
                        isToday && !selected ? "ring-1 ring-inset ring-[#970E24]" : "",
                      ].join(" ")}
                    >
                      <span>{day}</span>
                      {(sample || hasLocal) && (
                        <span className="flex items-center gap-1" aria-hidden="true">
                          {sample && <span className={selected ? "h-1.5 w-1.5 rounded-full bg-white" : "h-1.5 w-1.5 rounded-full bg-[#0B5C5A]"} />}
                          {hasLocal && <span className={selected ? "h-1.5 w-1.5 rounded-full bg-[#F3C6D0]" : "h-1.5 w-1.5 rounded-full bg-[#890022]"} />}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-t border-[#E6DADC] pt-4 text-[12px] text-[#5F4A4F]">
                <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#0B5C5A]" /> Example day</span>
                <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#890022]" /> Local reference</span>
                <span className="flex items-center gap-2"><span className="h-3 w-3 border border-[#970E24]" /> Today</span>
              </div>
            </section>

            <section aria-label="Selected day's details" aria-live="polite" aria-atomic="true" className="border border-[#E6DADC] bg-white shadow-[0_12px_32px_-28px_rgba(58,0,16,0.55)]">
              <div className="border-t-[5px] border-[#890022] p-5 sm:p-7">
                <p className="text-[12px] font-semibold uppercase tracking-[0.13em] text-[#890022]">Selected day</p>
                <h3 className={ebGaramond.className + " mt-2 text-[33px] font-medium leading-tight sm:text-[38px]"}>
                  {formatDate(selectedDate, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                </h3>
                <p className="mt-3 text-[13px] leading-5 text-[#5F4A4F]">
                  {parish || "Diocese of Kalookan"}
                </p>
                <div className="mt-6 border-t border-[#E6DADC] pt-6">
                  {example ? (
                    <>
                      <p className="text-[11px] font-bold uppercase tracking-[0.13em] text-[#5F4A4F]">National calendar · sample</p>
                      <h4 className={ebGaramond.className + " mt-3 text-[28px] font-semibold leading-tight text-[#1E1114]"}>
                        {example.title}
                      </h4>
                      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
                        <span className="border border-[#E6DADC] px-3 py-1 text-[12px] font-semibold text-[#4B353A]">{example.rank}</span>
                        <ColorMarker color={example.color} />
                      </div>
                      <p className="mt-4 text-[13px] font-medium text-[#5F4A4F]">{example.season}</p>
                      <p className="mt-4 text-[14px] leading-7 text-[#5F4A4F]">{example.note}</p>
                    </>
                  ) : (
                    <>
                      <div className="flex h-10 w-10 items-center justify-center bg-[#F7E9ED] text-[#890022]">
                        <Clock className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <h4 className={ebGaramond.className + " mt-4 text-[28px] font-medium leading-tight"}>
                        Daily Ordo not yet loaded
                      </h4>
                      <p className="mt-3 text-[14px] leading-7 text-[#5F4A4F]">
                        This preview contains selected examples only. The absence
                        of an entry here does not mean there is no liturgical celebration.
                      </p>
                    </>
                  )}
                </div>
                {local.length > 0 && (
                  <div className="mt-6 border-t border-[#E6DADC] pt-5">
                    <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#890022]">Local celebrations · for review</p>
                    <div className="mt-3 space-y-4">
                      {local.map((item) => (
                        <div key={item.title} className="border-l-[3px] border-[#890022] bg-[#FBF9F9] px-4 py-3">
                          <p className="text-[15px] font-semibold text-[#1E1114]">{item.title}</p>
                          <p className="mt-1 text-[12px] text-[#5F4A4F]">{item.appliesTo}</p>
                          <p className="mt-2 text-[13px] leading-6 text-[#5F4A4F]">{item.note}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="mt-6 border-t border-[#E6DADC] pt-5">
                  <p className="text-[12px] font-semibold text-[#1E1114]">Readings and liturgical instructions</p>
                  <p className="mt-2 text-[13px] leading-6 text-[#5F4A4F]">
                    These will appear once the approved national calendar and
                    diocesan instructions are connected. No readings or rubrics
                    are inferred from the date.
                  </p>
                  <a
                    href="https://universalis.com/philippines/calendar.htm"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-flex min-h-11 items-center text-[13px] font-semibold text-[#0B5C5A] underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B5C5A]"
                  >
                    Consult a Philippines calendar reference
                    <span className="ml-1" aria-hidden="true">↗</span>
                  </a>
                </div>
              </div>
            </section>
          </div>

          <div className="mt-12 grid gap-10 border-t border-[#E6DADC] pt-10 lg:grid-cols-[1fr_1fr]">
            <section aria-labelledby="ordo-local-heading">
              <p className="text-[12px] font-semibold uppercase tracking-[0.13em] text-[#890022]">Particular calendar</p>
              <h2 id="ordo-local-heading" className={ebGaramond.className + " mt-2 text-[32px] font-medium leading-tight sm:text-[38px]"}>
                Diocesan reference dates
              </h2>
              <p className="mt-3 max-w-[500px] text-[14px] leading-7 text-[#5F4A4F]">
                These dates are marked for liturgical review. An annual Ordo must
                account for precedence and any approved transfer or local observance.
              </p>
              <div className="mt-5 divide-y divide-[#E6DADC] border-t border-b border-[#E6DADC]">
                {LOCAL_REFERENCE_DATES.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => goToLocalDate(item.month, item.day)}
                    className="flex min-h-[76px] w-full items-center gap-4 py-3 text-left hover:bg-[#F7E9ED] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#970E24]"
                  >
                    <span className="flex h-12 w-12 shrink-0 flex-col items-center justify-center bg-[#F3E6E9] text-[#890022]">
                      <span className="text-[10px] font-bold uppercase">{item.month === 8 ? "Aug" : "Dec"}</span>
                      <span className="text-[17px] font-semibold leading-none">{item.day}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-semibold text-[#1E1114]">{item.label}</span>
                      <span className="mt-1 block text-[12px] leading-5 text-[#5F4A4F]">{item.detail}</span>
                    </span>
                    <ChevronRight className="h-5 w-5 shrink-0 text-[#890022]" aria-hidden="true" />
                  </button>
                ))}
              </div>
            </section>
            <section aria-labelledby="ordo-colors-heading">
              <p className="text-[12px] font-semibold uppercase tracking-[0.13em] text-[#890022]">Quick guide</p>
              <h2 id="ordo-colors-heading" className={ebGaramond.className + " mt-2 text-[32px] font-medium leading-tight sm:text-[38px]"}>
                Liturgical colors
              </h2>
              <p className="mt-3 max-w-[500px] text-[14px] leading-7 text-[#5F4A4F]">
                Colors are shown with text labels for clarity. The actual color
                for a particular day follows the approved liturgical calendar.
              </p>
              <div className="mt-5 grid grid-cols-2 gap-3">
                {([
                  ["green", "Ordinary Time"],
                  ["violet", "Advent and Lent"],
                  ["white", "Festal celebrations"],
                  ["red", "Martyrs and Pentecost"],
                ] as const).map(([color, detail]) => (
                  <div key={color} className="border border-[#E6DADC] bg-white p-4">
                    <ColorMarker color={color} />
                    <p className="mt-2 text-[12px] leading-5 text-[#5F4A4F]">{detail}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </section>
      </main>
    </>
  );
}
