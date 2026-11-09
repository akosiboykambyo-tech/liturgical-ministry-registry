"use client";
import { useMemo, useState } from "react";
import { ebGaramond } from "@/app/fonts";
import { ArrowRight, CheckCircle2, FileText, Plus, QrCode, ShieldCheck, Upload, Users, X } from "@/components/phosphor-icons";
import { DemoHeading, DemoStat, DemoTag, card, demoButton, field, muted, secondaryButton } from "../_components/demo-ui";

type Stage = "access" | "roster" | "documents" | "payment" | "complete";
type Person = { id: number; name: string; ministry: string; renewing: boolean };
type Addition = { id: number; name: string; ministry: string };
const ministries=["Lectors and Commentators","Extraordinary Ministers of Holy Communion","Music Ministry","Altar Servers"];
const names:Person[]=[
 {id:1,name:"Amelia Navarro",ministry:ministries[0],renewing:true},
 {id:2,name:"Daniel Cruz",ministry:ministries[0],renewing:true},
 {id:3,name:"Isabel Reyes",ministry:ministries[1],renewing:true},
 {id:4,name:"Carlos Domingo",ministry:ministries[1],renewing:true},
 {id:5,name:"Bianca Lopez",ministry:ministries[2],renewing:true},
 {id:6,name:"Marco Flores",ministry:ministries[2],renewing:true},
 {id:7,name:"Paolo Garcia",ministry:ministries[3],renewing:true},
];
const DEMO_FEE=150;
const pesos=(n:number)=>"₱"+n.toLocaleString("en-PH",{minimumFractionDigits:2,maximumFractionDigits:2});
export default function ParishPrototype(){
 const [stage,setStage]=useState<Stage>("access");
 const [parish,setParish]=useState("Sample Parish of St. Joseph");
 const [role,setRole]=useState(ministries[0]);
 const [code,setCode]=useState("");
 const [error,setError]=useState("");
 const [people,setPeople]=useState(names);
 const [additions,setAdditions]=useState<Addition[]>([]);
 const [newName,setNewName]=useState("");
 const [newMinistry,setNewMinistry]=useState(ministries[0]);
 const [letter,setLetter]=useState("");
 const [method,setMethod]=useState<"QR"|"OTC">("QR");
 const [grouping,setGrouping]=useState<"consolidated"|"ministry">("consolidated");
 const [proofs,setProofs]=useState<Record<string,string>>({});
 const [transactions,setTransactions]=useState<Record<string,string>>({});
 const selected=people.filter(p=>p.renewing);
 const roster=useMemo(()=>ministries.map(m=>({ministry:m,people:people.filter(p=>p.ministry===m)})),[people]);
 const groups=grouping==="consolidated"?[{key:"All parish ministries",count:selected.length+additions.length}]:ministries.map(m=>({key:m,count:selected.filter(p=>p.ministry===m).length+additions.filter(a=>a.ministry===m).length})).filter(g=>g.count>0);
 const count=selected.length+additions.length;
 const addMember=()=>{
  if(newName.trim().split(/\s+/).length<2){setError("Enter the person's full name (at least two name parts).");return;}
  setAdditions(old=>[...old,{id:Date.now(),name:newName.trim(),ministry:newMinistry}]);setNewName("");setError("");
 };
 const submit=()=>{
  if(method==="QR"&&groups.some(g=>!proofs[g.key]||!transactions[g.key]?.trim())){setError("Provide a sample transaction reference and select a proof filename for every payment group.");return;}
  setError("");setStage("complete");
 };
 const stages=[{id:"access",label:"Verify access"},{id:"roster",label:"Review roster"},{id:"documents",label:"Recommendation"},{id:"payment",label:"Payment & submit"}];
 const position=stages.findIndex(s=>s.id===stage);
 return <>
 <DemoHeading eyebrow="FUTURE PARISH SELF-SERVICE" title="Parish Renewal Portal" description="One OTP-protected parish workspace for confirming rosters, proposing additional ministers, attaching recommendation letters and recording payment claims." action={<DemoTag tone="warn">Demonstration only</DemoTag>}/>
 <div className="mb-6 grid gap-2 sm:grid-cols-4">{stages.map((s,i)=><div key={s.id} className={"rounded-md border px-3 py-3 text-xs font-semibold "+(i===position?"border-[#890022] bg-[#F9EDEF] text-[#890022]":i<position||stage==="complete"?"border-[#CDE3D2] bg-[#F1F8F2] text-[#276849]":"border-[#E9DFE2] bg-white text-[#83717A]")}><span className="mr-2 opacity-60">0{i+1}</span>{s.label}</div>)}</div>
 {error&&<div role="alert" className="mb-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error} <button onClick={()=>setError("")} className="ml-2 underline">Dismiss</button></div>}
 {stage==="access"&&<section className="mx-auto max-w-[690px]">
   <div className={card+" space-y-5"}>
     <div className="flex items-center gap-3"><div className="grid h-12 w-12 place-items-center rounded-md bg-[#F5E9EC] text-[#890022]"><ShieldCheck className="h-6 w-6"/></div><div><h2 className={ebGaramond.className+" text-[28px]"}>Verify parish access</h2><p className={muted}>There are no coordinator passwords or accounts.</p></div></div>
     <label className="block text-xs font-semibold">Parish<select className={field+" mt-1"} value={parish} onChange={e=>{setParish(e.target.value);setCode("");}}>{["Sample Parish of St. Joseph","Sample Parish of Our Lady","Sample Parish of St. Peter"].map(p=><option key={p}>{p}</option>)}</select></label>
     <label className="block text-xs font-semibold">Coordinator ministry<select className={field+" mt-1"} value={role} onChange={e=>{setRole(e.target.value);setCode("");}}>{ministries.map(m=><option key={m}>{m}</option>)}</select></label>
     <div className="rounded-md border border-[#E6DADC] bg-[#FCF8F9] p-4 text-sm"><p className="font-semibold">Pre-registered mobile number</p><p className="mt-1 text-[#6B5960]">+63 ••• ••• 2187 <span className="ml-1 text-xs">(fictional)</span></p><p className="mt-2 text-xs text-[#78656C]">No SMS is sent. For this prototype, enter <strong>246810</strong> as the simulated OTP.</p></div>
     <label className="block text-xs font-semibold">One-time code<input className={field+" mt-1 tracking-[0.3em]"} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,"").slice(0,6))} inputMode="numeric" autoComplete="one-time-code" placeholder="6 digits" aria-label="Demo OTP"/></label>
     <button className={demoButton+" w-full"} onClick={()=>{if(code==="246810"){setError("");setStage("roster");}else setError("Incorrect demonstration code. Enter 246810.");}}>Continue to parish roster <ArrowRight className="h-4 w-4"/></button>
     <p className="text-center text-xs text-[#8B757E]">Demonstrates the intended interface only; this is not real authentication.</p>
   </div>
 </section>}
 {stage==="roster"&&<div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_290px]">
   <section className={card}>
     <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h2 className={ebGaramond.className+" text-[29px]"}>2027 Parish Renewal Roster</h2><p className={muted}>{parish} · Coordinator: {role}</p></div><DemoTag tone="good">Demo OTP verified</DemoTag></div>
     <div className="space-y-4">{roster.map(group=><div key={group.ministry} className="overflow-hidden rounded-md border border-[#E6DADC]">
       <div className="flex justify-between gap-2 bg-[#F8F1F3] px-4 py-3"><h3 className="text-sm font-semibold">{group.ministry}</h3><span className="text-xs text-[#745C66]">{group.people.filter(p=>p.renewing).length}/{group.people.length} renewing</span></div>
       {group.people.map(p=><label key={p.id} className="flex cursor-pointer items-center justify-between gap-3 border-t border-[#F1E8EA] px-4 py-3 text-sm"><span>{p.name}</span><span className="flex items-center gap-2 text-xs font-medium text-[#6C4F5B]"><input type="checkbox" checked={p.renewing} onChange={e=>setPeople(prev=>prev.map(x=>x.id===p.id?{...x,renewing:e.target.checked}:x))} className="h-4 w-4 accent-[#890022]"/>Renewing</span></label>)}
     </div>)}</div>
     <div className="mt-6 rounded-md border border-[#E6DADC] p-4"><h3 className={ebGaramond.className+" text-2xl"}>Additional members</h3><p className="mb-4 mt-1 text-xs leading-5 text-[#76636A]">An unlisted name is a proposal for diocesan validation, not an immediate member record.</p>
       <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"><input className={field} value={newName} onChange={e=>setNewName(e.target.value)} placeholder="Full name" aria-label="Unlisted full name"/><select className={field} value={newMinistry} onChange={e=>setNewMinistry(e.target.value)} aria-label="Proposed ministry">{ministries.map(m=><option key={m}>{m}</option>)}</select><button className={secondaryButton} onClick={addMember}><Plus className="h-4 w-4"/> Add</button></div>
       {additions.length>0&&<ul className="mt-3 divide-y divide-[#EFE5E8]">{additions.map(a=><li key={a.id} className="flex items-center justify-between gap-3 py-2 text-xs"><span><strong>{a.name}</strong><span className="ml-2 text-[#76636A]">{a.ministry}</span></span><button onClick={()=>setAdditions(old=>old.filter(x=>x.id!==a.id))} aria-label={"Remove "+a.name}><X className="h-4 w-4"/></button></li>)}</ul>}
     </div>
   </section>
   <aside className="space-y-3"><DemoStat label="Renewing assignments" value={selected.length}/><DemoStat label="Unlisted proposals" value={additions.length} note="Require validation"/><div className={card}><p className="text-sm font-semibold">Parish-wide coordination</p><p className="mt-2 text-xs leading-5 text-[#715E66]">Any authorized ministry coordinator can submit across this parish. Real access must be scoped and logged by the server.</p></div><button className={demoButton+" w-full"} onClick={()=>{if(count===0){setError("Select at least one renewing or proposed member.");return;}setError("");setStage("documents");}}>Continue to recommendation <ArrowRight className="h-4 w-4"/></button></aside>
 </div>}
 {stage==="documents"&&<div className="mx-auto max-w-[820px]">
   <section className={card+" space-y-5"}><div><h2 className={ebGaramond.className+" text-[29px]"}>Recommendation Letter</h2><p className={muted}>Record receipt of the signed letter now. Documentary acceptance remains a Commission review decision.</p></div>
     <div className="rounded-md border-2 border-dashed border-[#D9C4CA] bg-[#FEFBFC] p-7 text-center"><Upload className="mx-auto h-8 w-8 text-[#890022]"/><p className="mt-2 text-sm font-semibold">Attach a sample recommendation letter</p><p className="mt-1 text-xs text-[#816D75]">Select a local filename only. This test page does not upload the file.</p><input type="file" accept=".pdf,image/png,image/jpeg" className="mx-auto mt-4 block max-w-full text-xs" onChange={e=>setLetter(e.target.files?.[0]?.name||"")}/>{letter&&<p className="mt-3 text-sm text-[#2E6B4A]">Selected: {letter}</p>}</div>
     <div className="flex flex-wrap justify-between gap-2"><button className={secondaryButton} onClick={()=>setStage("roster")}>Back to roster</button><button disabled={!letter} className={demoButton} onClick={()=>{setError("");setStage("payment");}}>Continue to payment <ArrowRight className="h-4 w-4"/></button></div>
   </section>
 </div>}
 {stage==="payment"&&<div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_330px]">
   <section className={card+" space-y-5"}><div><h2 className={ebGaramond.className+" text-[29px]"}>Payment & Submission</h2><p className={muted}>Submit your renewal and payment evidence together. Financial confirmation and approval occur later.</p></div>
     <div className="rounded-md bg-[#FFF4E2] px-4 py-3 text-xs leading-5 text-[#815B23]"><strong>Illustrative pricing only:</strong> {pesos(DEMO_FEE)} per entry. This is not an approved Commission fee schedule and cannot be used to collect money.</div>
     <div><p className="mb-2 text-sm font-semibold">Payment arrangement</p><div className="grid gap-2 sm:grid-cols-2"><button className={"rounded-md border p-3 text-left text-sm "+(grouping==="consolidated"?"border-[#890022] bg-[#FBF1F3]":"border-[#E6DADC]")} onClick={()=>{setGrouping("consolidated");setProofs({});setTransactions({});}}><strong className="block">Consolidated parish</strong><span className="mt-1 block text-xs text-[#725C65]">One payment across ministries</span></button><button className={"rounded-md border p-3 text-left text-sm "+(grouping==="ministry"?"border-[#890022] bg-[#FBF1F3]":"border-[#E6DADC]")} onClick={()=>{setGrouping("ministry");setProofs({});setTransactions({});}}><strong className="block">Per ministry</strong><span className="mt-1 block text-xs text-[#725C65]">Separate payments and references</span></button></div></div>
     <div><p className="mb-2 text-sm font-semibold">Payment method</p><div className="flex flex-wrap gap-2"><button className={method==="QR"?demoButton:secondaryButton} onClick={()=>setMethod("QR")}><QrCode className="h-4 w-4"/>QR Payment</button><button className={method==="OTC"?demoButton:secondaryButton} onClick={()=>setMethod("OTC")}>Over-the-counter</button></div></div>
     {method==="QR"?<div className="rounded-md border border-[#E6DADC] bg-[#FCF8F9] p-5"><div className="flex flex-wrap items-center gap-4"><div className="grid h-28 w-28 place-items-center rounded-md border border-[#E1D1D6] bg-white"><QrCode className="h-16 w-16 text-[#8F7280]"/></div><div><p className="font-semibold text-sm">Official payment QR placeholder</p><p className="mt-1 text-xs leading-5 text-[#74606B]">Not scannable. No payment destination is connected in this prototype.</p></div></div></div>:<div className="rounded-md bg-[#F8F1F3] p-4 text-sm leading-6">Bring the submission reference to an authorized collection office. Payment remains <strong>OTC Pending</strong> until the responsible collector records receipt.</div>}
     <div className="space-y-3">{groups.map(group=><div key={group.key} className="rounded-md border border-[#E6DADC] p-4"><div className="mb-3 flex flex-wrap justify-between gap-2"><div><p className="text-sm font-semibold">{group.key}</p><p className="text-xs text-[#796771]">{group.count} chargeable entries, including proposed additions</p></div><strong className="tabular-nums text-sm">{pesos(group.count*DEMO_FEE)}</strong></div>
       {method==="QR"&&<div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold">Transaction reference<input className={field+" mt-1"} value={transactions[group.key]||""} onChange={e=>setTransactions(old=>({...old,[group.key]:e.target.value}))} placeholder="Sample transaction ID"/></label><label className="text-xs font-semibold">Payment proof (not uploaded)<input type="file" accept="image/*,.pdf" className={field+" mt-1 text-xs"} onChange={e=>setProofs(old=>({...old,[group.key]:e.target.files?.[0]?.name||""}))}/>{proofs[group.key]&&<span className="text-xs font-normal text-[#47765B]">{proofs[group.key]}</span>}</label></div>}
     </div>)}</div>
   </section>
   <aside className="space-y-3"><div className={card}><p className="text-xs text-[#7C6670]">Illustrative total</p><p className={ebGaramond.className+" mt-1 text-4xl font-semibold tabular-nums"}>{pesos(count*DEMO_FEE)}</p><p className="mt-2 text-xs text-[#77616B]">{selected.length} renewing + {additions.length} unlisted proposals</p><p className="mt-3 text-xs leading-5 text-[#77616B]">This total is provisional. Rejected proposed additions may require an auditable adjustment after review.</p></div><button className={demoButton+" w-full"} onClick={submit}>Submit renewal (demo) <ArrowRight className="h-4 w-4"/></button><button className={secondaryButton+" w-full"} onClick={()=>setStage("documents")}>Back to documents</button></aside>
 </div>}
 {stage==="complete"&&<section className="mx-auto max-w-[760px]">
   <div className={card+" text-center"}><div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#E8F4EB] text-[#24734E]"><CheckCircle2 className="h-8 w-8"/></div><h2 className={ebGaramond.className+" mt-4 text-[34px]"}>Submission Recorded (Demo)</h2><p className="mt-1 text-sm text-[#745C66]">Your fictional renewal is awaiting Commission validation.</p><div className="my-5 rounded-md bg-[#F8F2F4] px-5 py-5"><p className="text-xs uppercase tracking-wide text-[#765E66]">Submission reference</p><p className="mt-1 text-xl font-semibold tracking-wide">DEMO-COWL-2027-0001</p></div><div className="grid grid-cols-2 gap-3 text-left"><div><p className="text-xs text-[#806B73]">Renewal entries</p><strong>{count}</strong></div><div><p className="text-xs text-[#806B73]">Payment status</p><DemoTag tone="warn">{method==="QR"?"Proof submitted — unverified":"OTC pending"}</DemoTag></div><div><p className="text-xs text-[#806B73]">Payment grouping</p><strong className="text-sm">{grouping==="ministry"?"Per ministry":"Consolidated parish"}</strong></div><div><p className="text-xs text-[#806B73]">Registration status</p><DemoTag>Under review</DemoTag></div></div><p className="mt-5 text-xs leading-5 text-[#7A626B]">Nothing was submitted, saved, collected, authenticated or uploaded. This is only a workflow simulation.</p><button className={secondaryButton+" mt-4"} onClick={()=>{setStage("access");setCode("");setProofs({});setTransactions({});}}>Restart demonstration</button></div>
 </section>}
 </>;
}
