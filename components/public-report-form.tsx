"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ebGaramond } from "@/app/fonts";

type ReportKind = "record_detail" | "authenticity" | "renewal" | "incident" | "liturgy_assistance" | "vestment_loan" | "other";

const REPORT_OPTIONS: { value: ReportKind; label: string }[] = [
  { value: "record_detail", label: "Correction of a registry record" },
  { value: "authenticity", label: "Certificate or registration verification" },
  { value: "renewal", label: "Renewal procedures and requirements" },
  { value: "incident", label: "Report an incident involving a liturgical minister" },
  { value: "liturgy_assistance", label: "Assistance with liturgical celebrations" },
  { value: "vestment_loan", label: "Request to borrow liturgical vestments" },
  { value: "other", label: "Other inquiries or concerns" },
];

const DETAIL_HINTS: Record<ReportKind, string> = {
  record_detail: "Describe the incorrect information and what should be corrected.",
  authenticity: "Provide the certificate or Registry ID, if available, and explain what you want verified.",
  renewal: "Mention your ministry and parish, and the renewal procedure you need help with.",
  incident: "Describe what happened, including the date and location if known. Avoid unnecessary sensitive personal information.",
  liturgy_assistance: "Describe the celebration, date, location and assistance requested.",
  vestment_loan: "Specify vestments, quantities, borrowing and return dates, and parish or organization.",
  other: "Describe your inquiry or concern.",
};

type FieldErrors = Partial<
  Record<
    "reportKind" | "subject" | "details" | "reporterName" | "reporterEmail",
    string
  >
>;

type SubmitResult = {
  ok?: boolean;
  reference?: string;
  submittedAt?: string;
  error?: string;
};

export function PublicReportForm() {
  const params = useSearchParams();

  const presetSubject = useMemo(() => {
    const name = params.get("name")?.trim();
    const parish = params.get("parish")?.trim();

    if (name && parish) return `${name} — ${parish}`;
    return name ?? "";
  }, [params]);

  const memberContext = Boolean(params.get("memberId") || params.get("registryId") || params.get("name"));
  const [reportKind, setReportKind] = useState<ReportKind>(memberContext ? "record_detail" : "other");
  const [subject, setSubject] = useState(presetSubject);
  const [details, setDetails] = useState("");
  const [reporterName, setReporterName] = useState("");
  const [reporterEmail, setReporterEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);

  const memberId = params.get("memberId") ?? "";
  const registryId = params.get("registryId") ?? "";

  const validate = () => {
    const next: FieldErrors = {};

    if (!reportKind) next.reportKind = "Choose what you want to report.";
    if (memberContext && !subject.trim()) next.subject = "Enter the minister or record concerned.";
    if (!details.trim()) next.details = "Describe your inquiry or concern.";
    if (!reporterName.trim()) next.reporterName = "Enter your name.";
    if (!reporterEmail.trim()) {
      next.reporterEmail = "Enter your email address.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reporterEmail.trim())) {
      next.reporterEmail = "Enter a valid email address.";
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!validate() || submitting) return;

    setSubmitting(true);
    setResult(null);

    try {
      const response = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportKind,
          subject: subject.trim() || REPORT_OPTIONS.find((option) => option.value === reportKind)?.label || "General inquiry",
          details: details.trim(),
          reporterName: reporterName.trim(),
          reporterEmail: reporterEmail.trim(),
          memberId,
          registryId,
          website,
        }),
      });

      const data = (await response.json()) as SubmitResult;

      if (!response.ok || !data.ok) {
        setResult({
          error: data.error ?? "We could not send the report. Please try again.",
        });
        return;
      }

      setResult(data);
    } catch {
      setResult({
        error: "We could not send the report. Please check your connection and try again.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (result?.ok) {
    return (
      <div className="max-w-[720px]">
        <p className={`${ebGaramond.className} text-[30px] font-normal italic text-[#970E24]`}>
          Thank you.
        </p>
        <h1 className={`${ebGaramond.className} mt-1 text-[48px] font-medium leading-tight sm:text-[60px]`}>
          Your submission has been received.
        </h1>
        <p className="mt-5 text-[17px] leading-8 text-[#5F4A4F]">
          The Commission can review it using the reference number below.
        </p>

        <dl className="mt-8 border-t border-[#E6DADC]">
          <div className="grid gap-2 border-b border-[#E6DADC] py-4 sm:grid-cols-[180px_1fr]">
            <dt className={`${ebGaramond.className} text-[18px] italic text-[#5F4A4F]`}>
              Reference number
            </dt>
            <dd className="font-semibold">{result.reference}</dd>
          </div>
          <div className="grid gap-2 border-b border-[#E6DADC] py-4 sm:grid-cols-[180px_1fr]">
            <dt className={`${ebGaramond.className} text-[18px] italic text-[#5F4A4F]`}>
              Received
            </dt>
            <dd className="font-semibold">
              {result.submittedAt
                ? new Date(result.submittedAt).toLocaleString("en-PH", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })
                : "Recorded"}
            </dd>
          </div>
        </dl>

        <p className="mt-6 text-[15px] leading-7 text-[#5F4A4F]">
          A response-time commitment has not yet been set, so the registry does
          not promise a reply date here.
        </p>
      </div>
    );
  }

  const errorItems = Object.entries(errors);

  return (
    <form onSubmit={handleSubmit} noValidate className="max-w-[780px]">
      {errorItems.length > 0 && (
        <div role="alert" className="mb-8 border-l-4 border-[#B00020] bg-[#FBEFEF] px-5 py-4">
          <p className="font-semibold text-[#75101F]">
            There {errorItems.length === 1 ? "is" : "are"} {errorItems.length}{" "}
            {errorItems.length === 1 ? "thing" : "things"} to fix before we can send this.
          </p>
          <ul className="mt-3 space-y-1 text-[14px] text-[#75101F]">
            {errorItems.map(([field, message]) => (
              <li key={field}>
                <a href={`#${field}`} className="underline underline-offset-3">
                  {message}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <fieldset id="reportKind">
        <legend className={`${ebGaramond.className} text-[24px] font-medium`}>
          How can we help you? <span className="text-[16px] font-normal">(required)</span>
        </legend>
        <div className="mt-4 border-t border-[#E6DADC]">
          {REPORT_OPTIONS.map(({ value, label }) => (
            <label
              key={value}
              className="flex min-h-14 cursor-pointer items-center gap-3 border-b border-[#E6DADC] py-3 text-[16px]"
            >
              <input
                type="radio"
                name="reportKind"
                value={value}
                checked={reportKind === value}
                onChange={() => setReportKind(value)}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
        {errors.reportKind && (
          <p className="mt-2 text-[14px] text-[#B00020]">{errors.reportKind}</p>
        )}
      </fieldset>

      <div className="mt-8">
        <label htmlFor="subject" className={`${ebGaramond.className} text-[22px] font-medium`}>
          {memberContext ? "Who is this about?" : "Who or what is this about?"}{" "}
          <span className="text-[16px] font-normal">({memberContext ? "required" : "optional"})</span>
        </label>
        <input
          id="subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="mt-2 min-h-14 w-full border border-[#CDBFC2] bg-white px-4 text-[16px]"
        />
        {presetSubject && (
          <p className="mt-2 text-[14px] leading-6 text-[#5F4A4F]">
            We filled this in from the registry record you were viewing.
          </p>
        )}
        {errors.subject && (
          <p className="mt-2 text-[14px] text-[#B00020]">{errors.subject}</p>
        )}
      </div>

      <div className="mt-8">
        <label htmlFor="details" className={`${ebGaramond.className} text-[22px] font-medium`}>
          Tell us more <span className="text-[16px] font-normal">(required)</span>
        </label>
        <textarea
          id="details"
          aria-describedby="details-hint"
          rows={6}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          className="mt-2 w-full border border-[#CDBFC2] bg-white px-4 py-3 text-[16px] leading-7"
        />
        <p id="details-hint" className="mt-2 text-[14px] leading-6 text-[#5F4A4F]">{DETAIL_HINTS[reportKind]}</p>
        {reportKind === "incident" && (
          <p className="mt-3 border-l-2 border-[#970E24] pl-4 text-[14px] leading-6 text-[#5F4A4F]">
            Please avoid unnecessary sensitive personal information. This form is not an emergency reporting channel.
            For immediate danger, contact the appropriate emergency services.
          </p>
        )}
        {errors.details && (
          <p className="mt-2 text-[14px] text-[#B00020]">{errors.details}</p>
        )}
      </div>

      <div className="mt-8 grid gap-7 sm:grid-cols-2">
        <div>
          <label htmlFor="reporterName" className={`${ebGaramond.className} text-[22px] font-medium`}>
            Your name <span className="text-[16px] font-normal">(required)</span>
          </label>
          <input
            id="reporterName"
            value={reporterName}
            onChange={(e) => setReporterName(e.target.value)}
            className="mt-2 min-h-14 w-full border border-[#CDBFC2] bg-white px-4 text-[16px]"
          />
          {errors.reporterName && (
            <p className="mt-2 text-[14px] text-[#B00020]">{errors.reporterName}</p>
          )}
        </div>

        <div>
          <label htmlFor="reporterEmail" className={`${ebGaramond.className} text-[22px] font-medium`}>
            Your email <span className="text-[16px] font-normal">(required)</span>
          </label>
          <input
            id="reporterEmail"
            type="email"
            value={reporterEmail}
            onChange={(e) => setReporterEmail(e.target.value)}
            className="mt-2 min-h-14 w-full border border-[#CDBFC2] bg-white px-4 text-[16px]"
          />
          {errors.reporterEmail && (
            <p className="mt-2 text-[14px] text-[#B00020]">{errors.reporterEmail}</p>
          )}
        </div>
      </div>

      <div className="hidden" aria-hidden="true">
        <label htmlFor="website">Website</label>
        <input
          id="website"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>

      {result?.error && (
        <div role="alert" className="mt-7 border-l-4 border-[#B00020] bg-[#FBEFEF] px-5 py-4 text-[#75101F]">
          {result.error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="mt-8 min-h-14 rounded-[3px] bg-[#970E24] px-7 text-[16px] font-semibold text-white disabled:opacity-60"
      >
        {submitting ? "Submitting…" : "Submit inquiry or concern"}
      </button>

      <p className="mt-3 text-[14px] leading-6 text-[#5F4A4F]">
        We use your details only to follow up on this report.
      </p>
    </form>
  );
}
