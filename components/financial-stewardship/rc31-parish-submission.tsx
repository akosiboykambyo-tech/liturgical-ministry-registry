"use client";
import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import Link from "next/link";
import {ebGaramond} from "@/app/fonts";
import {FileText,ShieldCheck,History,PenLine,RefreshCw,ArrowRight,CheckCircle2} from "@/components/phosphor-icons";
import {getFinancialStagingClient} from "@/lib/financial-stewardship/staging-client";
import {StagingAuthShell} from "@/components/financial-stewardship/staging-portal-login";
import SampleParishSignIn from "@/components/financial-stewardship/sample-parish-sign-in";

type Assignment={id:string;minister_label:string;parish:string;ministry:string;renewal_date:string|null};
type Application={id:string;reference:string;parish:string;ministry:string;service_year:number;members:number;channel:string;status:string;review_note:string|null;roster:string[];due_centavos:number|null;paid_centavos:number;preferred_payment_method:string|null;sample_document_received:string|null;sample_document_retain_until:string|null};
type Snapshot={roles:{admin:boolean};assignments:Assignment[];applications:Application[]};
const primary="inline-flex min-h-11 items-center justify-center gap-2 rounded-sm bg-[color:var(--registry-button)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40";
const secondary="inline-flex min-h-11 items-center justify-center gap-2 border border-[color:var(--finance-control-border)] bg-white px-4 py-2 text-sm font-semibold disabled:opacity-40";
const field="min-h-11 w-full border border-[color:var(--finance-control-border)] bg-white px-3 py-2 text-sm";
const label="mb-1 block text-xs font-semibold text-[color:var(--registry-muted)]";
const names:Record<string,string>={submitted:"For review",returned:"Correction requested",documents_approved:"Documents approved",awaiting_payment:"Awaiting full payment",renewed:"Renewed"};
const money=(n:number)=>new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP"}).format(n/100);

export default function ParishSubmission(){
 const client=useMemo(()=>getFinancialStagingClient(),[]);
 const [data,setData]=useState<Snapshot|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [parish,setParish]=useState(""),[verified,setVerified]=useState(false),[step,setStep]=useState<"roster"|"documents"|"submit">("roster");
 const [tab,setTab]=useState<"new"|"history">("new"),[ministry,setMinistry]=useState(""),[year,setYear]=useState("2027"),[selected,setSelected]=useState<string[]>([]),[letter,setLetter]=useState(false),[method,setMethod]=useState<"OTC"|"QR">("OTC"),[appId,setAppId]=useState(""),[correction,setCorrection]=useState(false);
 const flight=useRef(false);
 const load=useCallback(async()=>{
  setLoading(true);setError("");
  try{
   if(!client)throw Error("TEST connection unavailable.");
   const auth=await client.auth.getUser();if(auth.error||!auth.data.user){setData(null);return;}
   const access=await client.rpc("rc3_demo_access");
   if(access.error||access.data?.admin!==true){setData(null);setError("An authorized TEST Registry administrator must open this rehearsal.");return;}
   const r=await client.rpc("rc3_demo_snapshot");if(r.error||r.data?.roles?.admin!==true)throw Error(r.error?.message??"Registry authorization required.");
   setData(r.data as Snapshot);
  }catch(e){setData(null);setError(e instanceof Error?e.message:"Unable to load TEST rehearsal.");}
  finally{setLoading(false);}
 },[client]);
 useEffect(()=>{void load()},[load]);
 const apps=(data?.applications??[]).filter(a=>a.parish===parish&&a.channel==="online_rehearsal");
 const roster=(data?.assignments??[]).filter(a=>a.parish===parish);
 const used= new Set((data?.applications??[]).filter(a=>a.parish===parish&&a.ministry===ministry&&a.service_year===Number(year)).flatMap(a=>a.roster??[]));
 const matching=roster.filter(a=>a.ministry===ministry);
 const chosen=apps.find(a=>a.id===appId);
 function reset(){setVerified(false);setParish("");setStep("roster");setSelected([]);setLetter(false);setMinistry("");setAppId("");setCorrection(false);setNotice("");setError("");setTab("new");}
 async function submit(isCorrection=false){
  if(!client||!data?.roles.admin||!verified||flight.current||loading)return;
  if(isCorrection?(!chosen||chosen.status!=="returned"||!correction):(!selected.length||!letter))return;
  flight.current=true;setBusy(true);setError("");setNotice("");
  try{
   const auth=await client.auth.getUser();if(auth.error||!auth.data.user)throw Error("TEST session expired; sign in again.");
   const r=isCorrection?await client.rpc("rc3_demo_online_resubmit",{p_application_id:chosen!.id,p_parish:parish,p_sample_letter:correction}):await client.rpc("rc3_demo_online_submit",{p_parish:parish,p_year:Number(year),p_assignment_ids:selected,p_method:method,p_sample_letter:letter});
   if(r.error)throw Error(r.error.message);
   if(!isCorrection){setAppId(r.data.id);setNotice("Application "+r.data.reference+" received. It is now in the Registry Review Queue.");}else setNotice("Correction submitted to the same application. Registry review can resume.");
   setSelected([]);setLetter(false);setCorrection(false);setStep("roster");setTab("history");await load();
  }catch(e){setError(e instanceof Error?e.message:"Submission failed. No success was confirmed.");}
  finally{setBusy(false);flight.current=false;}
 }
 if(!data||!verified)return <StagingAuthShell>{loading?<p role="status">Checking TEST operator access…</p>:!data?<div className="space-y-4"><h1 className={ebGaramond.className+" text-4xl"}>Connected parish rehearsal</h1><p className="text-sm">An authorized Registry TEST operator session is required to write to the shared review queue. Use the standalone parish sign-in rehearsal to try mobile OTP without that session.</p>{error&&<p role="alert" className="text-sm">{error}</p>}<Link className={primary+" w-full"} href="/demo/finance">Open TEST staff sign-in</Link><Link className="block text-sm underline" href="/demo/finance/policy">Try parish mobile sign-in</Link></div>:<SampleParishSignIn onVerified={c=>{setParish(c.parish);setVerified(true);setStep("roster")}}/>}</StagingAuthShell>;
 return <div className="min-h-screen"><header className="bg-[#890022] px-5 py-5 text-white"><div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3"><div><p className="text-xs uppercase tracking-widest">PARISH RENEWAL PORTAL</p><h1 className={ebGaramond.className+" text-3xl"}>{parish}</h1></div><button className="min-h-11 border border-white/60 px-4 py-2 text-sm" disabled={busy} onClick={reset}>Sign out</button></div></header>
 <main className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-8">
 <nav aria-label="Parish navigation" className="flex flex-wrap gap-2 border-b pb-2">{([{id:"new",name:"Renewal Application",icon:PenLine},{id:"history",name:"My Applications",icon:History}] as const).map(t=><button key={t.id} type="button" aria-pressed={tab===t.id} className={"inline-flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm font-semibold "+(tab===t.id?"border-[#890022] text-[#890022]":"border-transparent")} onClick={()=>{setTab(t.id);setError("");setCorrection(false)}}><t.icon className="h-5 w-5"/>{t.name}</button>)}<button type="button" className={secondary+" ml-auto"} disabled={busy||loading} onClick={()=>void load()}><RefreshCw className="h-4 w-4"/>Refresh</button></nav>
 {error&&<p role="alert" className="finance-panel text-[color:var(--registry-error)]">{error}</p>}{notice&&<div role="status" className="finance-panel flex items-center gap-2 text-sm"><CheckCircle2 className="h-5 w-5"/>{notice}</div>}
 {tab==="new"&&<><ol aria-label="Renewal application progress" className="grid gap-2 sm:grid-cols-3">{(["roster","documents","submit"] as const).map((s,i)=><li key={s} aria-current={step===s?"step":undefined} className={"border px-3 py-3 text-sm font-semibold "+(step===s?"border-[#890022] bg-[#F9EDEF] text-[#890022]":"bg-white")}>0{i+1} · {["Review roster","Recommendation letter","Review and submit"][i]}</li>)}</ol><form className="finance-panel space-y-4" onSubmit={e=>{e.preventDefault();if(step==="submit")void submit()}}>{step==="roster"&&<><h2 className={ebGaramond.className+" text-3xl"}>Parish Renewal Roster</h2><div className="grid gap-3 sm:grid-cols-2"><label><span className={label}>Ministry</span><select className={field} required value={ministry} onChange={e=>{setMinistry(e.target.value);setSelected([]);setLetter(false)}}><option value="">Select ministry</option>{Array.from(new Set(roster.map(a=>a.ministry))).map(m=><option key={m}>{m}</option>)}</select></label><label><span className={label}>Service year</span><select className={field} value={year} onChange={e=>{setYear(e.target.value);setSelected([]);setLetter(false)}}>{[2026,2027,2028,2029,2030,2031].map(y=><option key={y}>{y}</option>)}</select></label></div>
 <fieldset><legend className="font-semibold">Select ministry assignments</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{matching.map(a=><label key={a.id} className="flex min-h-11 items-center gap-2 border p-3 text-sm"><input type="checkbox" disabled={used.has(a.minister_label)} checked={selected.includes(a.id)} onChange={e=>{setSelected(old=>e.target.checked?[...old,a.id]:old.filter(x=>x!==a.id));setLetter(false)}}/>{a.minister_label}{used.has(a.minister_label)&&<span className="text-xs text-[color:var(--registry-muted)]">Already submitted</span>}</label>)}</div>{!matching.length&&<p className="mt-2 text-sm">Choose a ministry to view its sample roster.</p>}</fieldset>
 <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm">{selected.length} assignments selected</p><button className={primary} type="button" disabled={!selected.length||loading} onClick={()=>setStep("documents")}>Continue to recommendation <ArrowRight className="h-4 w-4"/></button></div></>}{step==="documents"&&<><h2 className={ebGaramond.className+" text-3xl"}>Recommendation Letter</h2><div className="border-2 border-dashed border-[#D9C4CA] p-7 text-center"><FileText className="mx-auto h-8 w-8 text-[#890022]"/><h3 className="mt-2 font-semibold">Recommendation letter</h3><p className="mt-1 text-sm">Generated fictional letter for the selected roster. No personal file is uploaded.</p><button type="button" className={secondary+" mt-3"} disabled={!selected.length} onClick={()=>setLetter(true)}><FileText className="h-5 w-5"/>{letter?"Sample letter attached":"Attach sample recommendation letter"}</button></div><div className="flex flex-wrap justify-between gap-2"><button className={secondary} type="button" onClick={()=>setStep("roster")}>Back to roster</button><button className={primary} type="button" disabled={!letter} onClick={()=>setStep("submit")}>Continue to review <ArrowRight className="h-4 w-4"/></button></div></>}{step==="submit"&&<><h2 className={ebGaramond.className+" text-3xl"}>Review and Submission</h2><div className="border p-4 text-sm"><strong>{parish}</strong><p>{ministry} · {year} · {selected.length} ministers</p><p className="mt-2">Sample recommendation letter attached</p></div>
 <fieldset><legend className="font-semibold">Preferred payment method</legend><div className="mt-2 flex gap-4">{(["OTC","QR"] as const).map(m=><label key={m} className="flex min-h-11 items-center gap-2"><input type="radio" name="preferred-method" checked={method===m} onChange={()=>setMethod(m)}/>{m==="OTC"?"Over the counter":"QR Ph"}</label>)}</div></fieldset><p className="text-sm">{selected.length} selected · Payment will be authorized after document review.</p><div className="flex flex-wrap justify-between gap-2"><button className={secondary} type="button" disabled={busy} onClick={()=>setStep("documents")}>Back to recommendation</button><button className={primary} type="submit" disabled={busy||loading||!letter||!selected.length}>{busy?"Submitting…":"Submit to Registry"}</button></div></>}</form></>}
 {tab==="history"&&<><section className="finance-panel space-y-3"><h2 className={ebGaramond.className+" text-3xl"}>My applications</h2>{apps.map(a=><button key={a.id} type="button" aria-pressed={appId===a.id} onClick={()=>{setAppId(a.id);setCorrection(false)}} className={"flex w-full flex-wrap justify-between gap-3 border p-4 text-left "+(appId===a.id?"border-[#890022] bg-[#F7ECEF]":"")}><span><strong>{a.ministry}</strong><span className="block text-sm">{a.service_year} · {a.members} ministers</span><span className="block text-xs">{a.reference}</span></span><span className="text-sm font-medium">{names[a.status]??a.status}</span></button>)}{!apps.length&&<p className="text-sm">No online applications yet.</p>}</section>
 {chosen&&<section className="finance-panel space-y-4"><h2 className={ebGaramond.className+" text-2xl"}>{chosen.reference}</h2><p className="font-semibold">{names[chosen.status]??chosen.status}</p><ul className="list-disc pl-5 text-sm">{chosen.roster?.map((n,i)=><li key={i}>{n}</li>)}</ul>{chosen.sample_document_received&&<p className="text-sm">Sample letter received {chosen.sample_document_received} · Retain until {chosen.sample_document_retain_until}</p>}{chosen.review_note&&<p className="text-sm">Registry feedback: {chosen.review_note}</p>}{chosen.due_centavos!==null&&<p className="text-sm">Outstanding: <strong>{money(chosen.due_centavos-chosen.paid_centavos)}</strong> · Full payment only</p>}
 {chosen.status==="returned"&&<div className="space-y-3 border-t pt-3"><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={correction} onChange={e=>setCorrection(e.target.checked)}/>Attach corrected fictional recommendation letter (same roster)</label><button className={primary} disabled={busy||loading||!correction} onClick={()=>void submit(true)}>Resubmit correction</button></div>}</section>}</>}
 <Link href="/demo/finance/renewals" className="inline-block text-sm font-semibold underline">Return to Registry Administration</Link></main></div>;
}
