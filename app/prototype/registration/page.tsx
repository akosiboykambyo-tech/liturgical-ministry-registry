"use client";
import { useState } from "react";
import { ebGaramond } from "@/app/fonts";
import { ArrowRight, ClipboardCheck, FileSpreadsheet, Files, History, Plus, Search, ShieldCheck, X } from "@/components/phosphor-icons";
import { DemoHeading, DemoStat, DemoTag, card, demoButton, field, muted, secondaryButton } from "../_components/demo-ui";

type View = "submissions" | "review" | "history";
type Submission = { id: string; parish: string; kind: "New Registration" | "Renewal"; file: string; rows: number; status: string; source: string };
type Case = { id: number; person: string; parish: string; type: string; reason: string; state: "Open" | "Resolved"; action: string };
const initialSubmissions: Submission[] = [
 {id:"DEMO-SUB-001",parish:"Sample Parish of St. Joseph",kind:"New Registration",file:"initial-roster-2027.csv",rows:86,status:"Ready for review",source:"Initial registry baseline"},
 {id:"DEMO-SUB-002",parish:"Sample Parish of Our Lady",kind:"Renewal",file:"renewal-roster-2027.csv",rows:64,status:"Awaiting documents",source:"Staff-assisted CSV"},
 {id:"DEMO-SUB-003",parish:"Sample Parish of St. Peter",kind:"Renewal",file:"Portal submission",rows:43,status:"Under review",source:"Parish self-service"},
];
const initialCases: Case[] = [
 {id:1,person:"Maria Santos",parish:"Sample Parish of St. Joseph",type:"Possible Duplicate",reason:"A similar name appears in a previous parish roster.",state:"Open",action:"Review matching identity before creating UID"},
 {id:2,person:"Jose Reyes",parish:"Sample Parish of Our Lady",type:"Document Review",reason:"A recommendation letter has been submitted but not accepted.",state:"Open",action:"Verify the signed evidence"},
 {id:3,person:"Ana Cruz",parish:"Sample Parish of St. Peter",type:"Proposed Addition",reason:"Submitted by a coordinator; not present in existing roster.",state:"Open",action:"Confirm identity and ministry eligibility"},
 {id:4,person:"Sample Parish of St. Peter",parish:"Sample Parish of St. Peter",type:"Payment Review",reason:"QR proof submitted. Receiving-account reconciliation pending.",state:"Open",action:"Verify funds independently of screenshot"},
 {id:5,person:"Pedro Lim",parish:"Sample Parish of Our Lady",type:"Final Approval",reason:"Document accepted and identity cleared; authorized decision pending.",state:"Open",action:"Approve ministry assignment through secure workflow"},
];

export default function RegistrationPrototype() {
 const [view,setView]=useState<View>("submissions");
 const [items,setItems]=useState(initialSubmissions);
 const [cases,setCases]=useState(initialCases);
 const [newOpen,setNewOpen]=useState(false);
 const [selectedCase,setSelectedCase]=useState<number|null>(null);
 const [kind,setKind]=useState<"New Registration"|"Renewal">("New Registration");
 const [source,setSource]=useState("Initial registry baseline");
 const [parish,setParish]=useState("Sample Parish of St. Joseph");
 const [fileName,setFileName]=useState("");
 const [phase,setPhase]=useState<"setup"|"preview">("setup");
 const [notice,setNotice]=useState("");
 const [caseFilter,setCaseFilter]=useState("All");
 const [historyFilter,setHistoryFilter]=useState<"Registration"|"Renewal">("Registration");
 const [q,setQ]=useState("");
 const selected=cases.find(c=>c.id===selectedCase);
 const filteredCases=cases.filter(c=>((caseFilter==="All"||c.type===caseFilter) && (c.person+" "+c.parish+" "+c.type).toLowerCase().includes(q.toLowerCase())));
 const newDraft=()=>{
   const ref="DEMO-SUB-"+String(items.length+1).padStart(3,"0");
   setItems(old=>[{id:ref,parish,kind,file:fileName||"Sample roster.csv",rows:kind==="Renewal"?24:32,status:"Draft",source},...old]);
   setNewOpen(false);setPhase("setup");setFileName("");setView("submissions");setNotice(ref+" saved in this browser session for demonstration. No member records were created.");
 };
 const tabClass=(v:View)=>"min-h-11 rounded-md px-4 py-2.5 text-sm font-semibold transition "+(view===v?"bg-[#890022] text-white":"border border-[#E6DADC] bg-white text-[#5C3B46] hover:bg-[#F8EFF2]");
 return <>
   <DemoHeading eyebrow="MEMBER MANAGEMENT" title="Registration" description="Review registrations, process renewals, and manage member verification." action={<button className={demoButton} onClick={()=>setNewOpen(true)}><Plus className="h-4 w-4"/> New submission</button>}/>
   <div className="mb-5 grid gap-3 sm:grid-cols-3">
     <DemoStat label="Open submissions" value={items.length} note="Fictional working batches"/>
     <DemoStat label="Cases requiring review" value={cases.filter(c=>c.state==="Open").length} note="Across all case types"/>
     <DemoStat label="Ready to authorize" value="1" note="Approval remains simulated"/>
   </div>
   <nav aria-label="Registration workspace sections" className="mb-6 flex flex-wrap gap-2">
     <button onClick={()=>setView("submissions")} className={tabClass("submissions")}><Files className="mr-2 inline h-4 w-4"/>Submissions</button>
     <button onClick={()=>setView("review")} className={tabClass("review")}><ClipboardCheck className="mr-2 inline h-4 w-4"/>Review Queue</button>
     <button onClick={()=>setView("history")} className={tabClass("history")}><History className="mr-2 inline h-4 w-4"/>History</button>
   </nav>
   {notice&&<div role="status" className="mb-5 rounded-md border border-[#D4E8DA] bg-[#F0F8F2] px-4 py-3 text-sm text-[#266447]">{notice} <button className="ml-2 underline" onClick={()=>setNotice("")}>Dismiss</button></div>}
   {view==="submissions"&&<section className={card}>
     <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
       <div><h2 className={ebGaramond.className+" text-[29px]"}>Parish Submissions</h2><p className={muted}>New registrations and renewals share one intake desk. Drafts are reviewed before posting.</p></div>
       <DemoTag tone="neutral">CSV-first workflow</DemoTag>
     </div>
     <div className="overflow-x-auto">
       <table className="w-full min-w-[740px] text-left text-sm"><thead className="border-y border-[#ECE2E5] bg-[#FBF8F9] text-xs uppercase tracking-wide text-[#78636B]"><tr><th className="px-3 py-3">Reference / parish</th><th className="px-3 py-3">Type</th><th className="px-3 py-3">Rows</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Source</th><th className="px-3 py-3"></th></tr></thead><tbody>
       {items.map(item=><tr key={item.id} className="border-b border-[#F0E7EA]"><td className="px-3 py-3"><div className="font-semibold">{item.parish}</div><div className="mt-1 text-xs text-[#836D75]">{item.id} · {item.file}</div></td><td className="px-3 py-3">{item.kind}</td><td className="px-3 py-3 tabular-nums">{item.rows}</td><td className="px-3 py-3"><DemoTag tone={item.status==="Draft"?"neutral":"warn"}>{item.status}</DemoTag></td><td className="px-3 py-3 text-xs text-[#6E5F64]">{item.source}</td><td className="px-3 py-3"><button className="font-semibold text-[#890022] hover:underline" onClick={()=>{setNotice("Opened "+item.id+" (demo). Draft validation, document review and posting would use a dedicated batch drawer.");}}>View</button></td></tr>)}
       </tbody></table>
     </div>
     <div className="mt-4 rounded-md bg-[#F8F2F4] px-4 py-3 text-xs leading-5 text-[#66525B]">Existing registry updates, UID assignment and renewal validity are never performed on this test page. The production workflow will require server-controlled authorization and transactions.</div>
   </section>}
   {view==="review"&&<section className={card}>
     <div className="mb-4"><h2 className={ebGaramond.className+" text-[29px]"}>Unified Review Queue</h2><p className={muted}>All exceptions and decisions in one place. Select a case to inspect its details.</p></div>
     <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_220px]">
       <label className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-[#88737B]"/><input className={field+" pl-9"} placeholder="Search name, parish or case..." value={q} onChange={e=>setQ(e.target.value)} aria-label="Search review cases"/></label>
       <select className={field} value={caseFilter} onChange={e=>setCaseFilter(e.target.value)} aria-label="Filter review type">{["All","Possible Duplicate","Document Review","Proposed Addition","Payment Review","Final Approval"].map(v=><option key={v}>{v}</option>)}</select>
     </div>
     <div className="space-y-2">
       {filteredCases.map(c=><button key={c.id} onClick={()=>setSelectedCase(c.id)} className="flex w-full flex-wrap items-center justify-between gap-3 rounded-md border border-[#ECE2E5] bg-white px-4 py-3 text-left transition hover:border-[#BD8493] hover:bg-[#FEFAFB]">
         <div><div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-sm">{c.person}</span><DemoTag tone={c.state==="Resolved"?"good":"warn"}>{c.state}</DemoTag></div><p className="mt-1 text-xs text-[#74626A]">{c.parish} · {c.type}</p></div><ArrowRight className="h-5 w-5 text-[#890022]"/>
       </button>)}
       {filteredCases.length===0&&<p className="rounded-md bg-[#FBF8F9] p-5 text-sm text-[#6A5960]">No matching review cases. Adjust the filters to see other cases.</p>}
     </div>
   </section>}
   {view==="history"&&<section className={card}>
     <div className="mb-4"><h2 className={ebGaramond.className+" text-[29px]"}>Submission History</h2><p className={muted}>Two views in one place, with the system audit trail retained separately.</p></div>
     <div className="mb-4 flex gap-2">{(["Registration","Renewal"] as const).map(v=><button key={v} onClick={()=>setHistoryFilter(v)} className={historyFilter===v?demoButton:secondaryButton}>{v} history</button>)}</div>
     <div className="divide-y divide-[#ECE3E6] rounded-md border border-[#ECE3E6]">
       {(historyFilter==="Registration"?[
        {date:"Nov 08, 2026",name:"Initial base-roster validation",detail:"Sample Parish of St. Joseph · 86 rows · draft"},
        {date:"Nov 05, 2026",name:"Identity review completed",detail:"Sample Parish of St. Anne · 2 review decisions"},
       ]:[{date:"Nov 07, 2026",name:"Renewal document review",detail:"Sample Parish of Our Lady · 64 entries"},
        {date:"Nov 04, 2026",name:"Ministry renewal processed",detail:"Sample Parish of St. Peter · 41 assignments"}]).map(row=><div key={row.name} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="font-semibold text-sm">{row.name}</p><p className="mt-1 text-xs text-[#79666D]">{row.detail}</p></div><span className="text-xs text-[#79666D]">{row.date}</span></div>)}
     </div>
   </section>}
   {newOpen&&<div className="fixed inset-0 z-50 flex justify-end bg-[#1C0F14]/55" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setNewOpen(false);}}>
     <section role="dialog" aria-modal="true" aria-label="Create test submission" className="h-full w-full max-w-xl overflow-y-auto bg-white p-6 shadow-2xl sm:p-8">
       <div className="mb-6 flex items-start justify-between"><div><p className="text-xs font-semibold uppercase tracking-widest text-[#890022]">SUBMISSIONS</p><h2 className={ebGaramond.className+" mt-1 text-3xl"}>New Submission</h2></div><button onClick={()=>setNewOpen(false)} aria-label="Close dialog"><X className="h-5 w-5"/></button></div>
       <div className="mb-5 grid grid-cols-2 gap-2">{(["New Registration","Renewal"] as const).map(v=><button key={v} onClick={()=>{setKind(v);setSource(v==="New Registration"?"Initial registry baseline":"Staff-assisted CSV");setPhase("setup");}} className={"rounded-md border p-3 text-sm font-semibold "+(kind===v?"border-[#890022] bg-[#FCF0F3] text-[#890022]":"border-[#E6DADC]")}>{v}</button>)}</div>
       <div className="space-y-4">
         <label className="block text-xs font-semibold">Parish<select value={parish} onChange={e=>setParish(e.target.value)} className={field+" mt-1"}>{["Sample Parish of St. Joseph","Sample Parish of Our Lady","Sample Parish of St. Peter"].map(p=><option key={p}>{p}</option>)}</select></label>
         <label className="block text-xs font-semibold">Submission source<select value={source} onChange={e=>setSource(e.target.value)} className={field+" mt-1"}>{["Initial registry baseline","Staff-assisted CSV","Parish self-service"].map(p=><option key={p}>{p}</option>)}</select></label>
         <label className="block text-xs font-semibold">CSV roster (fictional demo only)<input type="file" accept=".csv,text/csv" className={field+" mt-1"} onChange={e=>setFileName(e.target.files?.[0]?.name||"")}/></label>
         <button className={secondaryButton} onClick={()=>setFileName("sample-parish-roster-2027.csv")}><FileSpreadsheet className="h-4 w-4"/> Use sample CSV</button>
         {fileName&&<p className="text-xs text-[#6A5960]">Selected file: {fileName}. Its contents are not uploaded or parsed in this prototype.</p>}
         {phase==="preview"&&<div className="rounded-md border border-[#E6DADC] bg-[#FBF7F8] p-4"><p className="text-sm font-semibold">Illustrative validation result</p><div className="mt-3 grid grid-cols-3 gap-2 text-center"><div><b className="block text-2xl">32</b><span className="text-xs">Rows</span></div><div><b className="block text-2xl">29</b><span className="text-xs">Ready</span></div><div><b className="block text-2xl">3</b><span className="text-xs">Require review</span></div></div><p className="mt-3 text-xs text-[#6A5960]">Real duplicate checks and import approval are not executed here.</p></div>}
         <div className="flex flex-wrap justify-end gap-2 border-t border-[#EEE3E7] pt-5"><button onClick={()=>setNewOpen(false)} className={secondaryButton}>Cancel</button>{phase==="setup"?<button disabled={!fileName} onClick={()=>setPhase("preview")} className={demoButton}>Preview validation <ArrowRight className="h-4 w-4"/></button>:<button onClick={newDraft} className={demoButton}>Save draft (demo)</button>}</div>
       </div>
     </section>
   </div>}
   {selected&&<div className="fixed inset-0 z-50 flex justify-end bg-[#1C0F14]/55" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setSelectedCase(null);}}>
     <section role="dialog" aria-modal="true" aria-label="Review case" className="h-full w-full max-w-xl overflow-y-auto bg-white p-6 shadow-2xl sm:p-8">
       <div className="mb-6 flex items-start justify-between"><div><p className="text-xs font-semibold uppercase tracking-widest text-[#890022]">REVIEW CASE #{selected.id}</p><h2 className={ebGaramond.className+" mt-1 text-3xl"}>{selected.type}</h2></div><button onClick={()=>setSelectedCase(null)} aria-label="Close review case"><X className="h-5 w-5"/></button></div>
       <p className="font-semibold">{selected.person}</p><p className={muted}>{selected.parish}</p><div className="my-5 rounded-md bg-[#FBF5F7] p-4"><p className="text-sm font-semibold">Reason for review</p><p className="mt-2 text-sm leading-6">{selected.reason}</p></div>
       <p className="text-sm font-semibold">Recommended next action</p><p className={muted}>{selected.action}.</p>
       <div className="mt-8 border-t border-[#EEE3E7] pt-5"><p className="mb-3 text-xs text-[#745E67]">This control demonstrates a review decision only; it never modifies members, documents or payments.</p><div className="flex flex-wrap gap-2"><button className={secondaryButton} onClick={()=>setSelectedCase(null)}>Keep open</button><button className={demoButton} disabled={selected.state==="Resolved"} onClick={()=>{setCases(old=>old.map(c=>c.id===selected.id?{...c,state:"Resolved"}:c));setNotice("Case #"+selected.id+" marked resolved in local demo state only.");setSelectedCase(null);}}><ShieldCheck className="h-4 w-4"/> Record mock decision</button></div></div>
     </section>
   </div>}
 </>;
}
