"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { importSingleMember, findDuplicateMembers } from "@/lib/duplicate-check";
import { PARISHES, MINISTRIES } from "@/lib/constants";
import { MinistryMultiSelect } from "@/components/ministry-multi-select";
import { Member } from "@/lib/types";
import {
  UserPlus,
  Save,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import Link from "next/link";

export default function AddMemberPage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [parish, setParish] = useState("");
  const [customParish, setCustomParish] = useState("");
  const [serviceYear, setServiceYear] = useState(new Date().getFullYear());
  const [ministries, setMinistries] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [dupeMatch, setDupeMatch] = useState<Member | null>(null);
  const [useCustomParish, setUseCustomParish] = useState(false);

  const resolvedParish = useCustomParish ? customParish.trim() : parish;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setDupeMatch(null);

    if (!firstName.trim() || !lastName.trim() || !resolvedParish.trim()) {
      setError("First name, last name, and parish are required.");
      return;
    }

    if (!Number.isInteger(serviceYear) || serviceYear < 2000 || serviceYear > 2100) {
      setError("Please select a valid service year.");
      return;
    }
    if (ministries.length === 0) {
      setError("Please select at least one ministry.");
      return;
    }

    setSubmitting(true);
    const result = await importSingleMember({
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      parish: resolvedParish.trim(),
      ministries,
      service_year: serviceYear,
      notes: notes.trim() || null,
    });

    if (result.status === "created") {
      setSuccess(
        `Created ${result.member.first_name} ${result.member.last_name} (UID: ${result.member.uid}). Routed to the Quick-Scan Verification Matrix for approval.`
      );
      setFirstName("");
      setLastName("");
      setParish("");
      setCustomParish("");
      setMinistries([]);
      setServiceYear(new Date().getFullYear());
      setNotes("");
    } else if (result.status === "duplicate") {
      setDupeMatch(result.existing);
      const matchDesc: Record<string, string> = {
        exact: "Exact match",
        same_name_different_parish: "Same name, different parish",
        similar_name: "Similar name (possible misspelling)",
      };
      const desc = matchDesc[result.matchType] || "Potential duplicate";
      setError(
        `${desc} detected: ${result.existing.first_name} ${result.existing.last_name} at ${result.existing.parish}. The new entry was flagged for review.`
      );
    } else {
      setError(result.error);
    }
    setSubmitting(false);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <UserPlus className="h-6 w-6 text-primary" />
          Add Member
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manually enter a new member. New records default to{" "}
          <span className="font-medium text-amber-700">Pending Verification</span>.
        </p>
      </div>

      {success && (
        <div className="flex items-start gap-2.5 rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-inset ring-emerald-600/20">
          <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {dupeMatch && (
        <div className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-inset ring-amber-600/20">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="font-medium">Possible duplicate detected</p>
              <p className="mt-1">
                Existing record:{" "}
                <button
                  type="button"
                  onClick={() => router.push(`/admin/members?search=${encodeURIComponent(dupeMatch.first_name + ' ' + dupeMatch.last_name)}`)}
                  className="font-semibold underline"
                >
                  {dupeMatch.first_name} {dupeMatch.last_name}
                </button>{" "}
                — {dupeMatch.parish} ({dupeMatch.ministries.join(", ")})
              </p>
              <p className="mt-1 text-xs text-amber-700">The new entry was flagged for review. You can find it in the CSV Import &rarr; Pending Merges tab.</p>
            </div>
          </div>
        </div>
      )}

      {error && !dupeMatch && (
        <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive ring-1 ring-inset ring-destructive/20">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="firstName">
              First Name <span className="text-destructive">*</span>
            </label>
            <input
              id="firstName"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Juan"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="lastName">
              Last Name <span className="text-destructive">*</span>
            </label>
            <input
              id="lastName"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
              className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Dela Cruz"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">
            Parish <span className="text-destructive">*</span>
          </label>
          {!useCustomParish ? (
            <div className="flex gap-2">
              <select
                value={parish}
                onChange={(e) => setParish(e.target.value)}
                required={!useCustomParish}
                className="flex-1 rounded-md border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Select a parish...</option>
                {PARISHES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setUseCustomParish(true)}
                className="shrink-0 rounded-md border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted"
              >
                Custom
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                value={customParish}
                onChange={(e) => setCustomParish(e.target.value)}
                required={useCustomParish}
                placeholder="Type parish name..."
                className="flex-1 rounded-md border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <button
                type="button"
                onClick={() => {
                  setUseCustomParish(false);
                  setCustomParish("");
                }}
                className="shrink-0 rounded-md border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted"
              >
                Use list
              </button>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="serviceYear" className="text-sm font-medium">
            Service Year <span className="text-destructive">*</span>
          </label>
          <p className="text-xs text-muted-foreground">
            The year this member begins or is renewed for service.
          </p>
          <select
            id="serviceYear"
            value={serviceYear}
            onChange={(e) => setServiceYear(Number(e.target.value))}
            required
            className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {Array.from(
              { length: 3 },
              (_, index) => new Date().getFullYear() - 1 + index
            ).map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">
            Assigned Ministry/Ministries <span className="text-destructive">*</span>
          </label>
          <p className="text-xs text-muted-foreground">
            Select one or more of the 6 Standard Ministries.
          </p>
          <MinistryMultiSelect
            value={ministries}
            onChange={setMinistries}
            columns={1}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="notes">
            Notes <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
            placeholder="Internal notes for the head office..."
          />
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <button
            type="button"
            onClick={() => router.push("/admin/dashboard")}
            className="rounded-md border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
          >
            {submitting ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</>
            ) : (
              <><Save className="h-4 w-4" /> Save Member</>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
