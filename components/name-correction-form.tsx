"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Mail } from "lucide-react";

type NameCorrectionMember = {
  memberId: string;
  registryId: string;
  currentName: string;
  parish: string;
};

type NameCorrectionFormProps = {
  member: NameCorrectionMember;
  onCancel: () => void;
};

type SubmitResult = {
  ok?: boolean;
  emailSent?: boolean;
  warning?: string;
  error?: string;
};

export function NameCorrectionForm({
  member,
  onCancel,
}: NameCorrectionFormProps) {
  const [correctedName, setCorrectedName] = useState("");
  const [requesterEmail, setRequesterEmail] = useState("");
  const [supportingDetails, setSupportingDetails] = useState("");
  const [website, setWebsite] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      !correctedName.trim() ||
      !requesterEmail.trim() ||
      submitting
    ) {
      return;
    }

    setSubmitting(true);
    setResult(null);

    try {
      const response = await fetch("/api/name-correction", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          memberId: member.memberId,
          registryId: member.registryId,
          correctedName: correctedName.trim(),
          requesterEmail: requesterEmail.trim(),
          supportingDetails: supportingDetails.trim(),
          website,
        }),
      });

      const data = (await response.json()) as SubmitResult;

      if (!response.ok || !data.ok) {
        setResult({
          error:
            data.error ??
            "The correction request could not be submitted. Please try again.",
        });
        return;
      }

      setResult(data);
    } catch {
      setResult({
        error:
          "The correction request could not be submitted. Please check your connection and try again.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (result?.ok) {
    return (
      <div className="mx-auto max-w-2xl py-4 sm:py-8">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-6 sm:px-7">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-700">
              <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-emerald-950">
                Correction request submitted
              </h3>
              <p className="mt-2 text-sm leading-6 text-emerald-900/80">
                Your request for {member.currentName} has been recorded for review.
              </p>

              {result.emailSent === false && (
                <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                  The request is safely recorded, but the email notification could
                  not be sent right now. The registry team can still review the
                  saved request.
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onCancel}
            className="mt-6 inline-flex min-h-10 items-center justify-center rounded-md border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-900 transition-colors hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/30"
          >
            Return to member details
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex items-start gap-3 border-b border-border pb-5">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#faedf0] text-[#970e24]">
            <Mail className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#970e24]">
              Name correction request
            </p>
            <h3 className="mt-1 text-lg font-semibold tracking-tight">
              Suggest a corrected member name
            </h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              The registry team will review the request before making any change.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 rounded-lg bg-muted/35 p-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Registry ID</p>
            <p className="mt-1 text-sm font-semibold">{member.registryId}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Parish</p>
            <p className="mt-1 text-sm font-semibold">{member.parish}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs font-medium text-muted-foreground">
              Currently displayed name
            </p>
            <p className="mt-1 text-sm font-semibold">{member.currentName}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div className="hidden" aria-hidden="true">
            <label htmlFor="correction-website">Website</label>
            <input
              id="correction-website"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(event) => setWebsite(event.target.value)}
            />
          </div>

          <div>
            <label
              htmlFor="corrected-name"
              className="text-sm font-semibold text-foreground"
            >
              Corrected name
            </label>
            <input
              id="corrected-name"
              required
              maxLength={160}
              value={correctedName}
              onChange={(event) => setCorrectedName(event.target.value)}
              placeholder="Enter the name as it should appear"
              className="mt-2 min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:border-[#970e24] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#970e24]/20"
            />
          </div>

          <div>
            <label
              htmlFor="requester-email"
              className="text-sm font-semibold text-foreground"
            >
              Your email address
            </label>
            <input
              id="requester-email"
              type="email"
              required
              maxLength={254}
              value={requesterEmail}
              onChange={(event) => setRequesterEmail(event.target.value)}
              placeholder="you@example.com"
              className="mt-2 min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:border-[#970e24] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#970e24]/20"
            />
            <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
              Used only if the registry team needs to follow up about this request.
            </p>
          </div>

          <div>
            <label
              htmlFor="supporting-details"
              className="text-sm font-semibold text-foreground"
            >
              Reason or supporting details
              <span className="ml-1 font-normal text-muted-foreground">
                (optional)
              </span>
            </label>
            <textarea
              id="supporting-details"
              rows={4}
              maxLength={1500}
              value={supportingDetails}
              onChange={(event) => setSupportingDetails(event.target.value)}
              placeholder="Explain the correction or provide any helpful context."
              className="mt-2 w-full resize-y rounded-md border border-input bg-background px-3 py-2.5 text-sm shadow-sm focus-visible:border-[#970e24] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#970e24]/20"
            />
          </div>

          {result?.error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-900"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{result.error}</span>
            </div>
          )}

          <div className="flex flex-col-reverse gap-2 border-t border-border pt-5 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onCancel}
              disabled={submitting}
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-semibold transition-colors hover:bg-muted disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#970e24] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#730a1c] disabled:cursor-wait disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#970e24]/30 focus-visible:ring-offset-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Sending request
                </>
              ) : (
                <>
                  <Mail className="h-4 w-4" aria-hidden="true" />
                  Submit correction
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
