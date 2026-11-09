"use client";

import { useEffect, useState } from "react";
import { ebGaramond } from "@/app/fonts";
import { ArrowRight, Files, History, RefreshCw, Upload } from "@/components/phosphor-icons";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { registrationUi } from "./registration-ui";

type RegistrationRow = {
  id: string; file_name: string | null; row_count: number;
  unique_inserted: number; duplicates_routed: number; status: string; created_at: string;
};
type RenewalRow = {
  id: string; parish: string; ministry: string | null;
  renewal_date: string; processed_at: string;
};
const panel = registrationUi.choice + " flex min-h-[190px] flex-col items-start";
const button = registrationUi.secondary;

export function SubmissionsOverview({
  onStart, onHistory, disabled = false,
}: {
  onStart: (kind: "new" | "renewal") => void;
  onHistory: (kind: "registration" | "renewal") => void;
  disabled?: boolean;
}) {
  const [registrations, setRegistrations] = useState<RegistrationRow[]>([]);
  const [renewals, setRenewals] = useState<RenewalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [registrationError, setRegistrationError] = useState("");
  const [renewalError, setRenewalError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const supabase = getSupabaseBrowserClient();
      const [imports, batches] = await Promise.all([
        supabase.from("import_batches")
          .select("id,file_name,row_count,unique_inserted,duplicates_routed,status,created_at")
          .order("created_at", { ascending: false }).limit(5),
        supabase.from("recommendation_renewal_batches")
          .select("id,parish,ministry,renewal_date,processed_at")
          .order("processed_at", { ascending: false }).limit(5),
      ]);
      if (cancelled) return;
      setRegistrations((imports.data ?? []) as RegistrationRow[]);
      setRenewals((batches.data ?? []) as RenewalRow[]);
      setRegistrationError(imports.error?.message ?? "");
      setRenewalError(batches.error?.message ?? "");
      setLoading(false);
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  return <div className="space-y-4">
    <div className="grid gap-3 md:grid-cols-2">
      <section className={panel}>
        <div className="flex items-center gap-2">
          <Upload className="h-5 w-5 text-[#890022]" aria-hidden="true" />
          <h3 className="text-[16px] font-semibold text-[#1E1114]">New Registration</h3>
        </div>
        <p className="mt-1 text-sm leading-6 text-[#6B5C62]">Import a parish roster by CSV and review its registration results.</p>
        <button type="button" disabled={disabled} onClick={() => onStart("new")} className={button + " mt-auto"}>
          Start new registration <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </section>
      <section className={panel}>
        <div className="flex items-center gap-2">
          <RefreshCw className="h-5 w-5 text-[#890022]" aria-hidden="true" />
          <h3 className="text-[16px] font-semibold text-[#1E1114]">Renewal</h3>
        </div>
        <p className="mt-1 text-sm leading-6 text-[#6B5C62]">Match an existing parish roster, associate its recommendation letter, and process eligible assignments.</p>
        <button type="button" disabled={disabled} onClick={() => onStart("renewal")} className={button + " mt-auto"}>
          Start renewal <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </section>
    </div>

    <section className={registrationUi.panel} aria-label="Recent submission activity">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><Files className="h-5 w-5 text-[#890022]" aria-hidden="true"/><h3 className={ebGaramond.className + " text-[30px] font-medium"}>Recent Activity</h3></div>
          <p className={registrationUi.caption + " mt-1"}>Actual recorded batches. This is not a saved-draft queue.</p>
        </div>
      </div>
      {loading ? <p role="status" className="py-5 text-sm text-[#5F4A4F]">Loading recent submissions…</p> : (
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="min-w-0">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-[#322029]">Registration imports</h4>
              <button type="button" onClick={() => onHistory("registration")} className="text-xs font-semibold text-[#890022] underline underline-offset-2">Full history</button>
            </div>
            {registrationError ? <p role="alert" className="text-xs text-[#A32439]">Unable to load registration batches: {registrationError}</p> :
            registrations.length === 0 ? <p className={registrationUi.empty}>No registration batches recorded yet. Start with a new parish roster above.</p> :
            <div className="divide-y divide-[#E6DADC] border border-[#E6DADC] bg-white">
              {registrations.map(r => <div key={r.id} className="flex items-center justify-between gap-3 px-3 py-3 text-sm">
                <div className="min-w-0"><p className="truncate font-medium" title={r.file_name ?? "Untitled"}>{r.file_name || "Untitled CSV"}</p><p className="mt-1 text-xs text-[#5F4A4F]">{r.row_count} rows · {r.unique_inserted} imported · <span className={r.duplicates_routed > 0 ? "font-semibold text-[#7A4E00]" : ""}>{r.duplicates_routed} flagged</span></p></div>
                <span className="shrink-0 text-xs text-[#75616A]">{new Date(r.created_at).toLocaleDateString("en-PH")}</span>
              </div>)}
            </div>}
          </div>
          <div className="min-w-0">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-[#322029]">Renewal batches</h4>
              <button type="button" onClick={() => onHistory("renewal")} className="text-xs font-semibold text-[#890022] underline underline-offset-2">Full history</button>
            </div>
            {renewalError ? <p role="alert" className="text-xs text-[#A32439]">Unable to load renewal batches: {renewalError}</p> :
            renewals.length === 0 ? <p className={registrationUi.empty}>No renewal batches recorded yet. Start a parish renewal above.</p> :
            <div className="divide-y divide-[#E6DADC] border border-[#E6DADC] bg-white">
              {renewals.map(r => <div key={r.id} className="flex items-center justify-between gap-3 px-3 py-3 text-sm">
                <div className="min-w-0"><p className="truncate font-medium" title={r.parish}>{r.parish}</p><p className="mt-1 text-xs text-[#75616A]">{r.ministry ?? "Multiple ministries"} · {r.renewal_date}</p></div>
                <span className="shrink-0 text-xs text-[#75616A]">{new Date(r.processed_at).toLocaleDateString("en-PH")}</span>
              </div>)}
            </div>}
          </div>
        </div>
      )}
      <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-[#5F4A4F]">
        <History className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        Registration drafts, persistent unified review cases, and coordinator submissions require the separate approved backend phase.
      </p>
    </section>
  </div>;
}
