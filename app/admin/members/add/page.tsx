"use client";

import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useRouter } from "next/navigation";
import { importSingleMember } from "@/lib/duplicate-check";
import { secureMinistryVerificationEnabled } from "@/lib/secure-ministry-verification";
import { validateRegistrationIntake } from "@/lib/registration-intake-validation";
import { normalizeApprovedMinistries } from "@/lib/registration-ministry-validation";
import { PARISHES } from "@/lib/constants";
import { MinistryMultiSelect } from "@/components/ministry-multi-select";
import { Member } from "@/lib/types";
import {
  Save,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import Link from "next/link";
import { ebGaramond } from "@/app/fonts";

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
  const [parishOpen, setParishOpen] = useState(false);

  const resolvedParish = useCustomParish ? customParish.trim() : parish;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (secureMinistryVerificationEnabled) {
      setError("Member registration through this older screen is unavailable in secure mode; use an audited intake workflow.");
      return;
    }
    setError(null);
    setSuccess(null);
    setDupeMatch(null);

    const validated = validateRegistrationIntake({
      first_name: firstName, last_name: lastName,
      parish: resolvedParish, ministries,
    });
    if (!validated.valid) {
      setError(validated.errors.join(" "));
      return;
    }
    const approved = normalizeApprovedMinistries(validated.normalized.ministries);
    if (!approved.valid) {
      setError("Select only approved COWL-DOK ministries.");
      return;
    }
    if (!Number.isInteger(serviceYear) || serviceYear < 2000 || serviceYear > 2100) {
      setError("Please select a valid service year.");
      return;
    }

    setSubmitting(true);
    const result = await importSingleMember({
      first_name: validated.normalized.first_name,
      last_name: validated.normalized.last_name,
      parish: validated.normalized.parish,
      ministries: approved.ministries,
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
    <div className="w-full space-y-5 pb-12 text-[#1E1114]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className={`${ebGaramond.className} text-[42px] font-medium leading-none text-[#1E1114] sm:text-[48px]`}>Add Member</h1>
          <p className="mt-1 text-sm text-muted-foreground">Register a liturgical minister and assign the appropriate ministries.</p>
        </div>
        <Link href="/admin/members" className="inline-flex h-9 items-center justify-center border border-[#D9C9CC] bg-white px-4 text-[12px] font-medium text-[#69001D] hover:bg-[#FBF4F5]">Back to Members</Link>
      </div>

      {success && (
        <div role="status" className="flex items-start gap-3 border-l-[3px] border-[#0B7069] bg-[#EAF5F1] px-4 py-3 text-sm text-[#07594F]">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /><span>{success}</span>
        </div>
      )}
      {dupeMatch && (
        <div role="alert" className="border-l-[3px] border-[#A86C00] bg-[#FFF7E7] p-4 text-[13px] text-[#77500C]">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">Possible duplicate detected</p>
              <p className="mt-1">Existing record: <button type="button" onClick={() => router.push(`/admin/members?search=${encodeURIComponent(dupeMatch.first_name + ' ' + dupeMatch.last_name)}`)} className="font-semibold underline">{dupeMatch.first_name} {dupeMatch.last_name}</button> — {dupeMatch.parish} ({dupeMatch.ministries.join(', ')})</p>
              <p className="mt-2 text-xs">The new entry was flagged for review. Find it in CSV Import → Pending Merges.</p>
            </div>
          </div>
        </div>
      )}
      {error && !dupeMatch && (
        <div role="alert" className="flex items-start gap-3 border-l-[3px] border-[#A32439] bg-[#FFF1F2] px-4 py-3 text-sm text-[#8A1830]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <section className="border border-[#E3D7DA] border-t-2 border-t-[#890022] bg-white">
          <div className="border-b border-[#E9DEE0] px-4 py-3 sm:px-5">
            <h2 className="text-[14px] font-semibold text-[#27191D]">Member Information</h2>
            <p className="mt-0.5 text-xs text-[#795F67]">Enter the minister&apos;s identifying details and service year.</p>
          </div>
          <div className="space-y-4 p-4 sm:p-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="firstName" className="block text-[12px] font-medium">First Name <span className="text-[#A21D37]">*</span></label>
                <input id="firstName" value={firstName} onChange={e => setFirstName(e.target.value)} required autoComplete="given-name" placeholder="Juan" className="w-full rounded-none border border-[#DCCFD2] bg-white px-3 py-2 text-[13px] outline-none focus:border-[#890022] focus:ring-1 focus:ring-[#890022]" />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="lastName" className="block text-[12px] font-medium">Last Name <span className="text-[#A21D37]">*</span></label>
                <input id="lastName" value={lastName} onChange={e => setLastName(e.target.value)} required autoComplete="family-name" placeholder="Dela Cruz" className="w-full rounded-none border border-[#DCCFD2] bg-white px-3 py-2 text-[13px] outline-none focus:border-[#890022] focus:ring-1 focus:ring-[#890022]" />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <div className="space-y-1.5">
                <label htmlFor={useCustomParish ? 'customParish' : 'parish'} className="block text-[12px] font-medium">Parish / Mission Station <span className="text-[#A21D37]">*</span></label>
                <div className="flex min-w-0 gap-2">
                  {useCustomParish ? (
                    <input id="customParish" value={customParish} onChange={e => setCustomParish(e.target.value)} required placeholder="Type parish name..." className="min-w-0 flex-1 rounded-none border border-[#DCCFD2] bg-white px-3 py-2 text-[13px] outline-none focus:border-[#890022]" />
                  ) : (
                    <Popover open={parishOpen} onOpenChange={setParishOpen}>
                      <PopoverTrigger asChild>
                        <button type="button" id="parish" role="combobox" aria-expanded={parishOpen} aria-label="Parish or mission station" className="flex min-h-11 min-w-0 flex-1 items-center justify-between gap-2 border border-[#DCCFD2] bg-white px-3 py-2 text-left text-[14px] text-[#1E1114] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#890022]">
                          <span className={parish ? "truncate" : "truncate text-[#5F4A4F]"}>{parish || "Search and select a parish..."}</span>
                          <ChevronsUpDown className="h-4 w-4 shrink-0 text-[#5F4A4F]" aria-hidden="true" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-[min(90vw,430px)] rounded-none border-[#DCCFD2] p-0">
                        <Command>
                          <CommandInput placeholder="Type a parish or mission station..." className="text-[14px]" />
                          <CommandList className="max-h-[260px]">
                            <CommandEmpty>No matching parish. Use Custom to enter another.</CommandEmpty>
                            <CommandGroup>
                              {[...PARISHES].sort((a,b) => a.localeCompare(b)).map(p => (
                                <CommandItem key={p} value={p} onSelect={() => { setParish(p); setParishOpen(false); }} className="cursor-pointer gap-2 py-2 text-[14px]">
                                  <Check className={parish === p ? "h-4 w-4 shrink-0 text-[#0B5C5A]" : "h-4 w-4 shrink-0 opacity-0"} aria-hidden="true" />
                                  <span className="whitespace-normal">{p}</span>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  )}
                  <button type="button" onClick={() => {setUseCustomParish(!useCustomParish); if(useCustomParish) setCustomParish('');}} className="shrink-0 border border-[#DCCFD2] bg-white px-3 py-2 text-[12px] font-medium text-[#760020] hover:bg-[#FBF4F5]">{useCustomParish ? 'Use list' : 'Custom'}</button>
                </div>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="serviceYear" className="block text-[12px] font-medium">Service Year <span className="text-[#A21D37]">*</span></label>
                <select id="serviceYear" value={serviceYear} onChange={e => setServiceYear(Number(e.target.value))} required className="w-full rounded-none border border-[#DCCFD2] bg-white px-3 py-2 text-[13px] outline-none focus:border-[#890022]">
                  {Array.from({ length: 3 }, (_, index) => new Date().getFullYear() - 1 + index).map(year => <option key={year} value={year}>{year}</option>)}
                </select>
              </div>
            </div>
          </div>
        </section>

        <section className="border border-[#E3D7DA] border-t-2 border-t-[#890022] bg-white">
          <div className="border-b border-[#E9DEE0] px-4 py-3 sm:px-5">
            <h2 className="text-[14px] font-semibold text-[#27191D]">Ministry Assignments</h2>
            <p className="mt-0.5 text-xs text-[#795F67]">Select one or more of the six standard ministries. New entries begin as Pending Verification.</p>
          </div>
          <div className="p-4 sm:p-5">
            <div className="[&_label]:!rounded-none [&_label]:!border-[#E4D9DB] [&_label]:!bg-white [&_label:has(input:checked)]:!border-[#890022] [&_label:has(input:checked)]:!bg-[#FCF4F5] [&_label_span]:!rounded-none">
              <MinistryMultiSelect value={ministries} onChange={setMinistries} columns={2} />
            </div>
          </div>
        </section>

        <section className="border border-[#E3D7DA] border-t-2 border-t-[#890022] bg-white">
          <div className="border-b border-[#E9DEE0] px-4 py-3 sm:px-5"><h2 className="text-[14px] font-semibold text-[#27191D]">Administrative Notes</h2></div>
          <div className="p-4 sm:p-5">
            <label htmlFor="notes" className="mb-1.5 block text-[12px] font-medium">Notes <span className="font-normal text-[#795F67]">(optional)</span></label>
            <textarea id="notes" value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Internal notes for the head office..." className="w-full resize-y rounded-none border border-[#DCCFD2] bg-white px-3 py-2.5 text-[13px] outline-none focus:border-[#890022] focus:ring-1 focus:ring-[#890022]" />
          </div>
        </section>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E3D7DA] pt-4">
          <p className="text-[12px] text-[#795F67]">Fields marked * are required.</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => router.push('/admin/dashboard')} className="border border-[#D9C9CC] bg-white px-4 py-2.5 text-[13px] font-medium text-[#51363E] hover:bg-[#FBF4F5]">Cancel</button>
            <button type="submit" disabled={submitting} className="inline-flex items-center justify-center gap-2 border border-[#890022] bg-[#890022] px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-[#6F001B] disabled:cursor-not-allowed disabled:opacity-60">
              {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</> : <><Save className="h-4 w-4" /> Save Member</>}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
