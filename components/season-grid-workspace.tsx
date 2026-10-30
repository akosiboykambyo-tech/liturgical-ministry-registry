"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ebGaramond } from "@/app/fonts";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { MINISTRIES } from "@/lib/constants";

type State = "Not sent" | "Sent" | "In progress" | "Submitted" | "Needs review" | "Reviewed";
type Door = "phone" | "paper" | "helper" | "csv";
type GridBatch = {
  id: string; parish: string; ministry: string; service_year: number;
  status: State; door: Door; total: number; approved: number; held: number;
  deferred: number; due_at: string | null;
};
type Season = { id: string; service_year: number; state: string };
type GridResult = { seasons: Season[]; batches: GridBatch[]; needs_review: number };
const clean = "border border-[#DED4D6] bg-white px-3 py-2.5 text-sm text-[#33252A] focus-visible:outline-2 focus-visible:outline-[#890022]";
const availableStates: Array<State | "All"> = ["All","Not sent","Sent","In progress","Submitted","Needs review","Reviewed"];
const doorName: Record<Door,string> = {phone:"Phone",paper:"Paper",helper:"Helper",csv:"CSV"};
function stateLabel(batch: GridBatch) {
  if (batch.status === "Reviewed") return `Reviewed${batch.deferred ? `, ${batch.deferred} deferred` : ""}`;
  if (batch.status === "Needs review" && (batch.approved || batch.held)) {
    return `${batch.approved} of ${batch.total} approved, ${batch.held} held`;
  }
  return batch.status;
}
export default function SeasonGridWorkspace() {
  const [result,setResult]=useState<GridResult|null>(null);
  const [year,setYear]=useState<string>("");
  const [status,setStatus]=useState<State|"All">("All");
  const [door,setDoor]=useState<Door|"All">("All");
  const [parish,setParish]=useState("All");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const load=useCallback(async()=>{
    setBusy(true);setMessage("");
    // A SECURE owner-only RPC must verify identity against registry_private allowlist.
    // Direct SELECT on private season tables is never an acceptable fallback.
    const {data,error}=await getSupabaseBrowserClient().rpc("season_grid_overview_v1");
    if(error || !data || typeof data!=="object" || Array.isArray(data)) {
      setResult(null);setMessage("The secure season workspace is not yet available. Existing registrations have not been changed.");
    } else {
      const payload=data as unknown as Partial<GridResult>;
      if(!Array.isArray(payload.seasons)||!Array.isArray(payload.batches)){
        setResult(null);setMessage("The season data could not be verified.");
      } else {
        setResult({seasons:payload.seasons,batches:payload.batches,needs_review:Number(payload.needs_review)||0});
        setYear(prior=>prior || String(payload.seasons?.[0]?.service_year || ""));
      }
    }
    setBusy(false);
  },[]);
  useEffect(()=>{void load()},[load]);
  const seasons=result?.seasons||[];
  const all=(result?.batches||[]).filter(b=>String(b.service_year)===year);
  const parishOptions=useMemo(()=>Array.from(new Set(all.map(b=>b.parish))).sort(),[all]);
  const rows=all.filter(b=>(status==="All"||b.status===status)&&(door==="All"||b.door===door)&&(parish==="All"||b.parish===parish));
  const names=Array.from(new Set(rows.map(b=>b.parish))).sort();
  const ministries=MINISTRIES.filter(m=>all.some(b=>b.ministry===m));
  return <div className="mx-auto max-w-[1500px] space-y-6 px-4 py-6 sm:px-6 lg:px-8 text-[#26191E]">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-xs font-semibold uppercase tracking-[.18em] text-[#890022]">Verification</p>
        <h1 className={`${ebGaramond.className} text-4xl sm:text-5xl`}>Season grid</h1>
        <p className="mt-1 max-w-2xl text-sm text-[#665960]">One batch per parish, ministry and service year. Select a cell to continue its work.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button disabled={!result} title={!result?"Requires authorized season database controls":undefined}
          className="min-h-11 border border-[#890022] px-4 text-sm font-semibold text-[#890022] disabled:opacity-40"
          onClick={()=>setMessage("Season creation requires the approved owner-only transaction. No changes were made.")}>New season</button>
        <button disabled={!result} title={!result?"Requires authorized season database controls":undefined}
          className="min-h-11 bg-[#890022] px-4 text-sm font-semibold text-white disabled:opacity-40"
          onClick={()=>setMessage("Adding a batch requires the approved owner-only transaction. No changes were made.")}>Add batch</button>
        <span className="min-h-11 border border-[#E2D8DC] bg-white px-3 py-3 text-sm font-semibold" aria-live="polite">Needs review: {result?.needs_review??"—"}</span>
      </div>
    </header>
    {message&&<p role="status" className="border-l-4 border-[#890022] bg-[#FAF4F5] p-4 text-sm">{message}</p>}
    {busy&&<p role="status" className="text-sm text-[#65555A]">Loading season data…</p>}
    <section className="grid gap-3 rounded-sm border border-[#E1D8DB] bg-[#FBF9F9] p-4 sm:grid-cols-4" aria-label="Grid filters">
      <label className="text-xs font-semibold">Service year
        <select className={`mt-1 block w-full ${clean}`} value={year} onChange={e=>setYear(e.target.value)}>
          {seasons.map(s=><option key={s.id} value={s.service_year}>{s.service_year}</option>)}
        </select>
      </label>
      <label className="text-xs font-semibold">Status
        <select className={`mt-1 block w-full ${clean}`} value={status} onChange={e=>setStatus(e.target.value as State|"All")}>
          {availableStates.map(s=><option key={s}>{s}</option>)}
        </select>
      </label>
      <label className="text-xs font-semibold">Submission method
        <select className={`mt-1 block w-full ${clean}`} value={door} onChange={e=>setDoor(e.target.value as Door|"All")}>
          <option value="All">All</option>{Object.entries(doorName).map(([value,label])=><option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label className="text-xs font-semibold">Parish
        <select className={`mt-1 block w-full ${clean}`} value={parish} onChange={e=>setParish(e.target.value)}>
          <option>All</option>{parishOptions.map(p=><option key={p}>{p}</option>)}
        </select>
      </label>
    </section>
    {result&&<section aria-label="Season batches">
      {ministries.length ? <div className="overflow-x-auto border border-[#E1D8DB] bg-white">
        <table className="w-full min-w-[850px] border-collapse text-left text-sm">
          <thead><tr className="bg-[#890022] text-white"><th className="sticky left-0 z-10 bg-[#890022] p-3">Parish</th>{ministries.map(m=><th className="min-w-[180px] p-3" key={m}>{m}</th>)}</tr></thead>
          <tbody>{names.map(name=><tr className="border-t border-[#E5DCDF]" key={name}>
            <th scope="row" className="sticky left-0 bg-white p-3 font-semibold">{name}</th>
            {ministries.map(ministry=>{
              const batch=rows.find(b=>b.parish===name&&b.ministry===ministry);
              return <td key={ministry} className="p-2 align-top">{batch?
                <Link href={`/admin/verification/batches/${encodeURIComponent(batch.id)}`}
                  className="block min-h-[88px] border border-[#E5D9DD] p-3 hover:border-[#890022] focus-visible:outline-2 focus-visible:outline-[#890022]">
                  <span className="block font-semibold">{stateLabel(batch)}</span>
                  <span className="mt-1 block text-xs text-[#6C5A60]">{doorName[batch.door]}</span>
                  {batch.due_at&&new Date(batch.due_at)<new Date()&&batch.status!=="Reviewed"&&
                    <span className="mt-1 block text-xs font-semibold text-[#890022]">Overdue</span>}
                </Link>:<span className="text-xs text-[#9B9194]">No batch</span>}</td>;
            })}
          </tr>)}</tbody>
        </table>
      </div>:<p className="border border-[#E5D9DD] bg-white p-8 text-center text-sm">No batches match this season and its filters.</p>}
    </section>}
  </div>;
}
