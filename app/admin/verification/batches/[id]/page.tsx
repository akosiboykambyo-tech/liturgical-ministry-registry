"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ebGaramond } from "@/app/fonts";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { progressForBatch, type BatchSummaryRow, type RosterClaim, type RowOutcome } from "@/lib/season-workflow";

type Person = BatchSummaryRow & {
  name: string; uid: string; admin_status: string;
  expiration_date: string | null; conflict?: boolean;
};
type Case = {
  id: string; kind: string; state: "open"|"deferred"|"confirmed"|"rejected";
  roster_id: string | null; detail: string; review_by: string | null;
  sensitive: boolean;
};
type BatchView = {
  id: string; parish: string; ministry: string; service_year: number;
  door: "phone"|"paper"|"helper"|"csv"; representative_name: string | null;
  status: string; letter_state: "pending"|"submitted"|"reviewed";
  last_activity_at: string | null;
  people: Person[]; cases: Case[];
};

const flag=process.env.NEXT_PUBLIC_SEASON_GRID_ENABLED === "enabled";
export default function BatchWorkspacePage() {
  const params=useParams();
  const id=typeof params?.id==="string"?params.id:"";
  const [batch,setBatch]=useState<BatchView|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const [showClean,setShowClean]=useState(false);
  const [showDeferred,setShowDeferred]=useState(false);
  const load=useCallback(async()=>{
    if(!flag||!id){setLoading(false);setError("This workspace is not yet available.");return;}
    setLoading(true);
    const {data,error:dbError}=await getSupabaseBrowserClient().rpc("season_batch_workspace_v1",{p_batch_id:id});
    if(dbError||!data||typeof data!=="object"||Array.isArray(data)){
      setBatch(null);setError("Secure batch records are unavailable. No registry data has been changed.");
    }else{
      const value=data as unknown as Partial<BatchView>;
      if(!value.id||!Array.isArray(value.people)||!Array.isArray(value.cases)){
        setBatch(null);setError("The batch response could not be verified.");
      }else{setBatch(value as BatchView);setError(null);}
    }
    setLoading(false);
  },[id]);
  useEffect(()=>{void load()},[load]);
  if(!flag) return <main className="p-8"><p>This workspace is not available yet.</p><Link className="underline" href="/admin/verification">Return to Verification</Link></main>;
  const people=batch?.people||[];
  const progress=progressForBatch(people);
  const exceptions=people.filter(p=>p.held||p.outcome==="pending"||p.conflict);
  const clean=people.filter(p=>!exceptions.some(e=>e.id===p.id));
  const deferred=(batch?.cases||[]).filter(c=>c.state==="deferred");
  const counts=(["Renewing","Not renewing","Transferred","Deceased","No response"] as RosterClaim[])
    .map(claim=>({claim,count:people.filter(p=>p.claim===claim).length}));
  const outcomes=(["renewed","not_renewing","case_resolved","deferred"] as RowOutcome[])
    .map(outcome=>({outcome,count:people.filter(p=>p.outcome===outcome).length}));
  return <main className="mx-auto max-w-[1400px] space-y-6 px-4 py-6 text-[#27191D] sm:px-8">
    <Link href="/admin/verification" className="text-sm font-semibold text-[#890022] underline">Verification / Season grid</Link>
    {loading&&<p role="status">Loading batch…</p>}
    {error&&<p role="alert" className="border-l-4 border-[#890022] bg-[#FBF1F3] p-4">{error}</p>}
    {batch&&<>
      <header className="border-b border-[#E1D6DA] pb-5">
        <p className="text-xs font-bold uppercase tracking-[.16em] text-[#890022]">Batch workspace · {batch.service_year}</p>
        <h1 className={`${ebGaramond.className} mt-2 text-3xl sm:text-5xl`}>{batch.parish}</h1>
        <p className="mt-2 text-base">{batch.ministry}</p>
        <p className="mt-2 text-sm text-[#5D4D52]">Representative: {batch.representative_name||"Not assigned"} · {batch.door.toUpperCase()} · {batch.status}</p>
        <p className="mt-1 text-sm text-[#5D4D52]">{progress.display}</p>
      </header>
      <section aria-label="Submission summary" className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {counts.map(({claim,count})=><div key={claim} className="border border-[#E3D9DD] bg-white p-3">
          <strong className="block text-2xl">{count}</strong><span className="text-xs text-[#605258]">{claim}</span>
        </div>)}
      </section>
      <section aria-label="Recommendation letter" className="border border-[#DED4D6] bg-white p-5">
        <h2 className="text-xl font-semibold">Shared recommendation letter</h2>
        <p className="mt-2 text-sm">One private letter is required for this parish–ministry batch.</p>
        <p className="mt-2 text-sm font-semibold">Letter: {batch.letter_state}</p>
        {batch.letter_state!=="reviewed"&&<p className="mt-2 text-sm text-[#890022]">Approval is unavailable until the letter is reviewed or you record an authorized override.</p>}
      </section>
      <section aria-labelledby="exception-heading" className="border border-[#E0D5D8] bg-white p-5">
        <h2 id="exception-heading" className={`${ebGaramond.className} text-3xl`}>Exceptions to review ({exceptions.length})</h2>
        <p className="mb-4 mt-1 text-sm text-[#605258]">Held and unanswered rows are excluded from bulk approval. You must record a final outcome or dated deferral.</p>
        <div className="divide-y divide-[#F0E9EA]">
          {exceptions.map(p=><div key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
            <div><p className="font-semibold">{p.name}</p><p className="text-xs text-[#6C6063]">{p.admin_status} · Coverage to {p.expiration_date||"Not set"}</p>
              <p className="text-xs">{p.claim} · {p.held?"Held":"Needs decision"}{p.conflict?" · Conflicting submission":""}</p></div>
            <span className="text-xs font-medium text-[#890022]">Owner review required</span>
          </div>)}
          {!exceptions.length&&<p className="py-4 text-sm">No unresolved member rows.</p>}
        </div>
        {!!deferred.length&&<div className="mt-3 border-t border-[#E1D6DA] pt-3">
          <button type="button" onClick={()=>setShowDeferred(v=>!v)} aria-expanded={showDeferred} className="text-sm font-semibold text-[#890022] underline">Deferred cases ({deferred.length})</button>
          {showDeferred&&deferred.map(c=><p key={c.id} className="mt-2 text-sm">Case {c.id.slice(0,8)} · Review by {c.review_by||"Missing date"}</p>)}
        </div>}
      </section>
      <section className="border border-[#E0D5D8] bg-white p-5">
        <button type="button" aria-expanded={showClean} onClick={()=>setShowClean(x=>!x)} className="text-xl font-semibold text-[#27191D] underline">
          Other rows ({clean.length}) {showClean?"−":"+"}
        </button>
        {showClean&&<div className="mt-3 divide-y divide-[#F0E9EA]">{clean.map(p=><div key={p.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
          <span>{p.name}</span><span className="text-[#5F5258]">{p.claim} · {p.outcome}</span></div>)}</div>}
      </section>
      <section className="border border-[#E1D6DA] bg-[#FBF9F9] p-5">
        <h2 className="text-xl font-semibold">Final review</h2>
        <p className="mt-1 text-sm">Outcomes: {outcomes.map(o=>`${o.count} ${o.outcome.replace("_"," ")}`).join(" · ")}</p>
        <p className="mt-2 text-sm text-[#605258]">The official batch record is stored in the database. An archive is optional; the parish receipt is available after Reviewed.</p>
        <button type="button" disabled title="Owner-only approval is unavailable until the approved transaction is installed"
          className="mt-4 min-h-11 bg-[#890022] px-5 text-sm font-semibold text-white disabled:opacity-50">
          Review and approve
        </button>
        <p className="mt-2 text-xs text-[#6B6064]">Approval is blocked until the private authorization, audit, letter and transaction gates are validated.</p>
      </section>
    </>}
  </main>;
}
