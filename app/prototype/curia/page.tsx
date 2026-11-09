"use client";
import { useMemo, useState } from "react";
import { ebGaramond } from "@/app/fonts";
import { ArrowRight, CheckCircle2, Filter, QrCode, Search, ShieldCheck, X } from "@/components/phosphor-icons";
import { DemoHeading, DemoStat, DemoTag, card, demoButton, field, muted, secondaryButton } from "../_components/demo-ui";

type Payment = {
 id:string; submission:string; parish:string; ministry:string; method:"QR"|"OTC"; amount:number;
 verified:boolean; claim:"Proof submitted"|"OTC pending"|"Received"|"Discrepancy";
 custodian:"Curia account"|"Commission account"|"Commission cash custody"|"Curia cashier";
 remittance:"Direct credit"|"Awaiting remittance"|"Submitted to Curia"|"Curia acknowledged"|"Discrepancy";
 external:string; allocation:string; verifiedBy:string; adjustment:string;
};
const seed:Payment[]=[
{id:"DEMO-COL-001",submission:"DEMO-COWL-001",parish:"Sample Parish of St. Joseph",ministry:"Multiple ministries",method:"QR",amount:7500,verified:true,claim:"Received",custodian:"Curia account",remittance:"Curia acknowledged",external:"BANK-DEMO-82612",allocation:"Lectors 3,000 · Music 4,500",verifiedBy:"Commission finance officer",adjustment:""},
{id:"DEMO-COL-002",submission:"DEMO-COWL-002",parish:"Sample Parish of Our Lady",ministry:"Music Ministry",method:"OTC",amount:3000,verified:true,claim:"Received",custodian:"Commission cash custody",remittance:"Awaiting remittance",external:"CASH-DEMO-104",allocation:"Music Ministry 3,000",verifiedBy:"Authorized collector",adjustment:""},
{id:"DEMO-COL-003",submission:"DEMO-COWL-003",parish:"Sample Parish of St. Peter",ministry:"Lectors and Commentators",method:"QR",amount:2500,verified:false,claim:"Proof submitted",custodian:"Commission account",remittance:"Awaiting remittance",external:"WALLET-DEMO-5207",allocation:"Lectors and Commentators 2,500",verifiedBy:"",adjustment:""},
{id:"DEMO-COL-004",submission:"DEMO-COWL-004",parish:"Sample Parish of St. Joseph",ministry:"Altar Servers",method:"OTC",amount:1800,verified:false,claim:"OTC pending",custodian:"Commission cash custody",remittance:"Awaiting remittance",external:"Not yet recorded",allocation:"Altar Servers 1,800",verifiedBy:"",adjustment:""},
{id:"DEMO-COL-005",submission:"DEMO-COWL-005",parish:"Sample Parish of Our Lady",ministry:"Multiple ministries",method:"OTC",amount:4100,verified:true,claim:"Received",custodian:"Curia cashier",remittance:"Curia acknowledged",external:"CURIA-DEMO-021",allocation:"EMHC 2,100 · Lectors 2,000",verifiedBy:"Curia cashier",adjustment:""},
{id:"DEMO-COL-006",submission:"DEMO-COWL-006",parish:"Sample Parish of St. Peter",ministry:"Multiple ministries",method:"QR",amount:6200,verified:false,claim:"Discrepancy",custodian:"Commission account",remittance:"Discrepancy",external:"WALLET-DEMO-5503",allocation:"EMHC 3,100 · Music 3,100",verifiedBy:"",adjustment:"Unverified transfer reference"},
];
const peso=(n:number)=>"₱"+n.toLocaleString("en-PH",{maximumFractionDigits:2,minimumFractionDigits:2});
export default function CuriaPrototype(){
 const [rows,setRows]=useState(seed);
 const [method,setMethod]=useState("All");
 const [status,setStatus]=useState("All");
 const [search,setSearch]=useState("");
 const [chosen,setChosen]=useState<string|null>(null);
 const [note,setNote]=useState("");
 const [message,setMessage]=useState("");
 const selected=rows.find(r=>r.id===chosen);
 const matches=rows.filter(p=>(method==="All"||p.method===method)&&(status==="All"||(status==="Pending"?!p.verified:p.remittance===status))&&(p.parish+" "+p.submission+" "+p.id+" "+p.ministry).toLowerCase().includes(search.toLowerCase()));
 const stats=useMemo(()=>({
  qr:rows.filter(p=>p.method==="QR"&&p.verified).reduce((a,p)=>a+p.amount,0),
  otc:rows.filter(p=>p.method==="OTC"&&p.verified).reduce((a,p)=>a+p.amount,0),
  awaiting:rows.filter(p=>p.verified&&p.remittance==="Awaiting remittance").reduce((a,p)=>a+p.amount,0),
  acknowledged:rows.filter(p=>p.verified&&p.remittance==="Curia acknowledged").reduce((a,p)=>a+p.amount,0)
 }),[rows]);
 const update=(fn:(r:Payment)=>Payment,ack:string)=>{if(!chosen)return;setRows(prev=>prev.map(p=>p.id===chosen?fn(p):p));setMessage(ack+" — local simulation only.");setNote("");setChosen(null);};
 const tone=(v:string):"neutral"|"good"|"warn"|"bad"=>v==="Curia acknowledged"||v==="Received"?"good":v==="Discrepancy"?"bad":v.includes("Pending")||v.includes("Awaiting")||v==="Proof submitted"?"warn":"neutral";
 return <>
   <DemoHeading eyebrow="COMMISSION & CURIA · FINANCIAL WORKFLOW" title="Collections & Remittances" description="Classify QR and OTC collections, verify receipt against independent evidence, identify the custodian, track remittances, and record Curia acknowledgment." action={<DemoTag tone="warn">Financial test only</DemoTag>}/>
   <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <DemoStat label="Verified QR collections" value={peso(stats.qr)} note="QR payments, not screenshots alone"/>
      <DemoStat label="Verified OTC collections" value={peso(stats.otc)} note="Cash confirmed by a collector"/>
      <DemoStat label="Awaiting remittance" value={peso(stats.awaiting)} note="Held by Commission"/>
      <DemoStat label="Curia acknowledged" value={peso(stats.acknowledged)} note="Direct credit or accepted remittance"/>
   </div>
   <div className="mb-5 grid gap-3 lg:grid-cols-3">
     <div className={card}><p className="text-xs font-semibold uppercase tracking-wide text-[#890022]">1 · Method</p><h2 className={ebGaramond.className+" mt-1 text-2xl"}>How they paid</h2><p className="mt-2 text-xs leading-5 text-[#73616A]">QR transfer versus over-the-counter cash. This does not prove funds were received.</p></div>
     <div className={card}><p className="text-xs font-semibold uppercase tracking-wide text-[#890022]">2 · Custody</p><h2 className={ebGaramond.className+" mt-1 text-2xl"}>Who holds funds</h2><p className="mt-2 text-xs leading-5 text-[#73616A]">Commission account, Commission cash collector, Curia bank account, or Curia cashier.</p></div>
     <div className={card}><p className="text-xs font-semibold uppercase tracking-wide text-[#890022]">3 · Reconciliation</p><h2 className={ebGaramond.className+" mt-1 text-2xl"}>Who confirmed</h2><p className="mt-2 text-xs leading-5 text-[#73616A]">Collection verification and Curia acknowledgment are separate accounting events.</p></div>
   </div>
   {message&&<div role="status" className="mb-4 rounded-md border border-[#C9E3D3] bg-[#F0F8F3] p-3 text-sm text-[#276448]">{message}<button className="ml-3 underline" onClick={()=>setMessage("")}>Dismiss</button></div>}
   <section className={card}>
     <div className="mb-4 flex flex-wrap items-end justify-between gap-4"><div><h2 className={ebGaramond.className+" text-[30px]"}>Financial Register</h2><p className={muted}>Select a payment to simulate independent verification, remittance or discrepancy handling.</p></div><DemoTag>6 fictional payment entries</DemoTag></div>
     <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_160px_210px]">
       <label className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-[#826D76]"/><input value={search} onChange={e=>setSearch(e.target.value)} className={field+" pl-9"} placeholder="Search parish or reference" aria-label="Search payment"/></label>
       <label className="relative"><Filter className="absolute left-3 top-3 h-4 w-4 text-[#826D76]"/><select value={method} onChange={e=>setMethod(e.target.value)} className={field+" pl-9"} aria-label="Payment method filter"><option>All</option><option>QR</option><option>OTC</option></select></label>
       <select value={status} onChange={e=>setStatus(e.target.value)} className={field} aria-label="Remittance filter"><option>All</option><option>Pending</option><option>Awaiting remittance</option><option>Submitted to Curia</option><option>Curia acknowledged</option><option>Discrepancy</option></select>
     </div>
     <div className="overflow-x-auto"><table className="w-full min-w-[890px] text-left text-sm"><thead className="border-y border-[#ECE1E5] bg-[#FBF8F9] text-xs uppercase tracking-wide text-[#795F69]"><tr><th className="px-3 py-3">Reference / parish</th><th className="px-3 py-3">Method</th><th className="px-3 py-3">Amount</th><th className="px-3 py-3">Collection</th><th className="px-3 py-3">Custodian</th><th className="px-3 py-3">Curia</th><th className="px-3 py-3"></th></tr></thead><tbody>{matches.map(p=><tr key={p.id} className="border-b border-[#F0E6E9]">
       <td className="px-3 py-3"><p className="font-semibold">{p.parish}</p><p className="mt-1 text-xs text-[#79636C]">{p.submission} · {p.id}</p></td>
       <td className="px-3 py-3"><span className="inline-flex items-center gap-1.5">{p.method==="QR"&&<QrCode className="h-4 w-4"/>}{p.method}</span></td>
       <td className="px-3 py-3 font-semibold tabular-nums">{peso(p.amount)}</td>
       <td className="px-3 py-3"><DemoTag tone={tone(p.claim)}>{p.claim}</DemoTag></td>
       <td className="px-3 py-3 text-xs text-[#6A5960]">{p.custodian}</td>
       <td className="px-3 py-3"><DemoTag tone={tone(p.remittance)}>{p.remittance}</DemoTag></td>
       <td className="px-3 py-3"><button onClick={()=>{setChosen(p.id);setNote("");}} className="font-semibold text-[#890022] hover:underline">Review</button></td>
     </tr>)}</tbody></table></div>
     {matches.length===0&&<p className="mt-4 rounded-md bg-[#FCF8F9] p-5 text-sm text-[#6C5961]">No payments match these filters.</p>}
     <p className="mt-4 text-xs text-[#79646D]">Collection and remittance references are distinct from official receipts. Only independently verified receipts should count toward confirmed collections.</p>
   </section>
   <section className={card+" mt-5"}><h2 className={ebGaramond.className+" text-[26px]"}>Financial adjustment principles</h2><div className="mt-3 grid gap-3 sm:grid-cols-3"><p className="rounded-md bg-[#F9F4F5] p-3 text-xs leading-5"><strong>Rejected proposed member</strong><br/>Retain the original charge and register an authorized refund or credit adjustment.</p><p className="rounded-md bg-[#F9F4F5] p-3 text-xs leading-5"><strong>Payment discrepancy</strong><br/>Flag for investigation. Do not automatically approve the related renewal.</p><p className="rounded-md bg-[#F9F4F5] p-3 text-xs leading-5"><strong>Consolidated payment</strong><br/>Allocate the verified amount to each ministry's obligations without double charging.</p></div></section>
   {selected&&<div className="fixed inset-0 z-50 flex justify-end bg-[#1C0F14]/55" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setChosen(null);}}>
     <section role="dialog" aria-modal="true" aria-label="Payment reconciliation detail" className="h-full w-full max-w-[620px] overflow-y-auto bg-white p-6 shadow-2xl sm:p-8">
       <div className="mb-6 flex items-start justify-between"><div><p className="text-xs font-semibold uppercase tracking-widest text-[#890022]">COLLECTION DETAIL</p><h2 className={ebGaramond.className+" mt-1 text-3xl"}>{selected.id}</h2></div><button onClick={()=>setChosen(null)} aria-label="Close collection details"><X className="h-5 w-5"/></button></div>
       <div className="mb-5 flex items-center justify-between gap-2"><div><p className="font-semibold text-sm">{selected.parish}</p><p className="mt-1 text-xs text-[#76636B]">{selected.submission} · {selected.ministry}</p></div><strong className={ebGaramond.className+" text-3xl tabular-nums"}>{peso(selected.amount)}</strong></div>
       <dl className="grid grid-cols-2 gap-x-4 gap-y-4 rounded-md bg-[#FAF5F7] p-4 text-sm">{[
        ["Payment method",selected.method],["Claim status",selected.claim],["Custody",selected.custodian],["Curia status",selected.remittance],["External reference",selected.external],["Verified by",selected.verifiedBy||"Not verified"],["Allocation",selected.allocation],["Adjustment",selected.adjustment||"None recorded"]
       ].map(([k,v])=><div key={k}><dt className="text-xs font-semibold text-[#795F69]">{k}</dt><dd className="mt-1 break-words text-xs">{v}</dd></div>)}</dl>
       <p className="mt-5 text-sm font-semibold">Simulated financial actions</p><p className="mt-1 text-xs leading-5 text-[#74606B]">Real collection confirmation requires independent bank records or cash custody evidence and authorized personnel. This demo changes local UI state only.</p>
       <div className="mt-4 space-y-2">
         {!selected.verified&&selected.claim!=="Discrepancy"&&<button className={demoButton+" w-full"} onClick={()=>update(p=>({...p,verified:true,claim:"Received",verifiedBy:"Demo reviewer",remittance:p.custodian==="Curia account"||p.custodian==="Curia cashier"?"Direct credit":"Awaiting remittance"}),"Collection marked verified")}><CheckCircle2 className="h-4 w-4"/> Verify collection (demo)</button>}
         {selected.verified&&selected.remittance==="Awaiting remittance"&&<button className={demoButton+" w-full"} onClick={()=>update(p=>({...p,remittance:"Submitted to Curia"}),"Remittance submitted")}><ArrowRight className="h-4 w-4"/> Prepare and submit remittance (demo)</button>}
         {selected.verified&&(selected.remittance==="Submitted to Curia"||selected.remittance==="Direct credit")&&<button className={demoButton+" w-full"} onClick={()=>update(p=>({...p,remittance:"Curia acknowledged"}),"Curia acknowledged payment")}><ShieldCheck className="h-4 w-4"/> Acknowledge for Curia (demo)</button>}
         {selected.claim!=="Discrepancy"&&selected.remittance!=="Curia acknowledged"&&<button className={secondaryButton+" w-full"} onClick={()=>update(p=>({...p,verified:false,claim:"Discrepancy",remittance:"Discrepancy"}),"Discrepancy flagged")}>Flag discrepancy (demo)</button>}
         <label className="mt-4 block text-xs font-semibold">Provisional adjustment note (illustrative)<textarea value={note} onChange={e=>setNote(e.target.value)} rows={3} className={field+" mt-1"} placeholder="e.g. Refund review for rejected unlisted member"/></label>
         <button disabled={!note.trim()} className={secondaryButton+" w-full"} onClick={()=>update(p=>({...p,adjustment:note.trim()}),"Adjustment note recorded")}>Record adjustment note (demo)</button>
       </div>
       <button className={secondaryButton+" mt-5 w-full"} onClick={()=>setChosen(null)}>Close</button>
     </section>
   </div>}
 </>;
}
