"use client";
import {useCallback,useEffect,useMemo,useRef,useState,type FormEvent} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {ebGaramond} from "@/app/fonts";
import {ClipboardList,PenLine,Inbox,History,RefreshCw,LogOut,Users} from "@/components/phosphor-icons";
import PortalShell from "@/components/financial-stewardship/demo-portal-shell";
import Phase16Review from "@/components/parish-renewal/phase16-review";
import {getFinancialStagingClient} from "@/lib/financial-stewardship/staging-client";

type Assignment={id:string;minister_label:string;parish:string;ministry:string;renewal_date:string|null;expiration_date:string|null};
type Application={id:string;reference:string;parish:string;ministry:string;service_year:number;channel:"online_rehearsal"|"walk_in";status:string;members:number;due_centavos:number|null;paid_centavos:number;review_note:string|null;renewed_at:string|null;payment_request_id:string|null;payment_reference:string|null;qr_prepared:boolean;roster:string[];preferred_payment_method:"OTC"|"QR"|null;sample_document_received:string|null;sample_document_retain_until:string|null};
type Snapshot={roles:{admin:boolean;finance:boolean};assignments:Assignment[];applications:Application[];events:{id:number;application_id:string;action:string;happened_at:string}[]};
const primary="inline-flex min-h-11 items-center justify-center gap-2 rounded-sm bg-[color:var(--registry-button)] px-4 py-2 text-sm font-semibold text-white hover:bg-[color:var(--registry-oxblood)] disabled:opacity-40";
const secondary="inline-flex min-h-11 items-center justify-center gap-2 rounded-sm border border-[color:var(--finance-control-border)] bg-white px-4 py-2 text-sm font-semibold disabled:opacity-40";
const field="min-h-11 w-full border border-[color:var(--finance-control-border)] bg-white px-3 py-2 text-sm";
const label="mb-1 block text-xs font-semibold text-[color:var(--registry-muted)]";
const money=(v:number|null)=>v===null?"—":new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP"}).format(v/100);
const statuses:Record<string,string>={submitted:"For review",documents_approved:"Documents approved",awaiting_payment:"Awaiting payment",renewed:"Renewed",returned:"Returned for correction"};
export default function RenewalDesk({embedded=false,onOpenCollection}:{embedded?:boolean;onOpenCollection?:(reference:string,method:"otc"|"qr")=>void}={}){
 const client=useMemo(()=>getFinancialStagingClient(),[]);
 const router=useRouter();
 const [data,setData]=useState<Snapshot|null>(null),[email,setEmail]=useState(""),[error,setError]=useState(""),[notice,setNotice]=useState(""),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const inFlight=useRef(false);
 const [tab,setTab]=useState<"applications"|"intake"|"roster"|"review"|"history">("applications");
 const [sourceFilter,setSourceFilter]=useState("all"),[queueFilter,setQueueFilter]=useState("all"),[query,setQuery]=useState("");
 const [year,setYear]=useState("2027"),[parish,setParish]=useState(""),[ministry,setMinistry]=useState(""),[selected,setSelected]=useState<string[]>([]);
 const [appId,setAppId]=useState(""),[reviewed,setReviewed]=useState(false),[returnNote,setReturnNote]=useState("");
 const load=useCallback(async()=>{
   if(!client){setError("TEST connection unavailable.");setLoading(false);return;}
   setLoading(true);setData(null);setError("");
   try{
     const auth=await client.auth.getUser();
     if(auth.error||!auth.data.user){router.replace("/demo/finance");return;}
     setEmail(auth.data.user.email??"");
     const result=await client.rpc("rc3_demo_snapshot");
     if(result.error)throw Error(result.error.message);
     if(!result.data||(!result.data.roles.admin&&!result.data.roles.finance))throw Error("Renewal desk permission required.");
     if(!embedded&&!result.data.roles.admin&&result.data.roles.finance){router.replace("/demo/finance/cowl");return;}
     if(embedded&&!result.data.roles.finance)throw Error("COWL finance permission required.");
     setData(result.data as Snapshot);
   }catch(e){setError(e instanceof Error?e.message:"Unable to load renewal applications.");}
   finally{setLoading(false);}
 },[client,router,embedded]);
 useEffect(()=>{void load()},[load]);
 async function act(name:string,params:Record<string,unknown>,message:string){
   if(!client||!data||busy||loading||inFlight.current)return;
   inFlight.current=true;setBusy(true);setError("");setNotice("");
   try{
     const r=await client.rpc(name,params);if(r.error)throw Error(r.error.message);
     if(name==="rc3_demo_submit"){setAppId(String(r.data));setSelected([]);setTab("review");setSourceFilter("all");setQueueFilter("all");setQuery("");}
     setReviewed(false);setReturnNote("");setNotice(message);
     await load();
   }catch(e){setError(e instanceof Error?e.message:"Operation rejected. Refresh before retrying.");}
   finally{setBusy(false);inFlight.current=false;}
 }
 async function signOut(){setData(null);if(client)await client.auth.signOut();router.replace("/demo/finance")}
 const roles=data?.roles;
 const canAdmin=Boolean(!embedded&&roles?.admin),canFinance=Boolean(embedded&&roles?.finance);
 const apps=data?.applications??[],assignments=data?.assignments??[];
 const chosen=apps.find(a=>a.id===appId);
 const legacyAssignments=assignments.filter(a=>!a.parish.startsWith("RC32 "));
 const matching=legacyAssignments.filter(a=>a.parish===parish&&a.ministry===ministry);
 const activeTab=canAdmin?tab:"applications";
 const visibleApps=(activeTab==="review"?apps.filter(a=>["submitted","returned"].includes(a.status)):apps).filter(a=>!canAdmin||!a.reference.startsWith("RN-DEMO-RC32-")).filter(a=>!canAdmin||((sourceFilter==="all"||a.channel===sourceFilter)&&(queueFilter==="all"||a.status===queueFilter)&&[a.parish,a.ministry,a.reference].join(" ").toLowerCase().includes(query.trim().toLowerCase())));
 const visibleChosen=visibleApps.some(a=>a.id===appId)?chosen:undefined;
 const resetSelection=()=>{setSelected([]);};
 function chooseApp(a:Application){setAppId(a.id);setReviewed(false);setReturnNote("");}
 function submit(e:FormEvent){e.preventDefault();void act("rc3_demo_submit",{p_channel:"walk_in",p_year:Number(year),p_assignment_ids:selected},"Application submitted for review.");}
 const content=<div className={embedded?"space-y-6":"finance-content"}>
 <header className="flex flex-wrap items-start justify-between gap-3"><div>{!embedded&&<><p className="text-xs font-semibold uppercase tracking-widest text-[color:var(--registry-crimson)]">REGISTRY ADMINISTRATION</p><h1 className={ebGaramond.className+" finance-page-title"}>{activeTab==="intake"?"Walk-in Application":activeTab==="roster"?"Sample Ministry Roster":activeTab==="review"?"Review Queue":activeTab==="history"?"Application History":"Renewal Processing Desk"}</h1></>}<p className="mt-2 text-sm text-[color:var(--registry-muted)]">Review applications, assess approved obligations and track renewal completion.</p>{canAdmin&&<div className="mt-2 flex flex-wrap gap-4"><Link href="/demo/finance/parish" className="text-sm font-semibold text-[color:var(--registry-crimson)] underline">Phase 1.6 Parish Portal</Link><Link href="/demo/finance/policy" className="text-sm font-semibold text-[color:var(--registry-crimson)] underline">Coordinator and policy rehearsal</Link></div>}</div><button type="button" className={secondary} disabled={busy||loading} onClick={()=>void load()}><RefreshCw className="h-4 w-4"/>Refresh</button></header>
 {error&&<p role="alert" className="finance-panel border-[color:var(--finance-error-border)] text-[color:var(--registry-error)]">{error}</p>}
 {notice&&<p role="status" className="finance-panel text-[color:var(--finance-success)]">{notice}</p>}
 {loading&&<p role="status">Loading renewal records…</p>}
 {!loading&&data&&<>
 {activeTab==="intake"&&canAdmin&&<section className="finance-panel space-y-3"><h2 className={ebGaramond.className+" text-3xl"}>Parish-wide walk-in application</h2><p className="text-sm">Start or resume a consolidated Phase 1.6 application using the same roster, recommendation and review requirements as online submissions.</p><Link href="/demo/finance/parish/walk-in" className={primary}>Open walk-in application</Link></section>}
 {activeTab==="intake"&&canAdmin&&<form className="finance-panel space-y-4" onSubmit={submit}>
  <h2 className={ebGaramond.className+" text-3xl"}>Legacy single-ministry TEST intake</h2>
  <p className="text-sm text-[color:var(--registry-muted)]">Encode only applications received in person. Online submissions arrive directly in the Review Queue.</p>
  <div className="grid gap-3 sm:grid-cols-3"><label><span className={label}>Parish</span><select className={field} value={parish} required onChange={e=>{setParish(e.target.value);setMinistry("");resetSelection()}}><option value="">Select parish</option>{Array.from(new Set(legacyAssignments.map(a=>a.parish))).map(p=><option key={p}>{p}</option>)}</select></label>
  <label><span className={label}>Ministry</span><select className={field} required value={ministry} onChange={e=>{setMinistry(e.target.value);resetSelection()}}><option value="">Select ministry</option>{Array.from(new Set(legacyAssignments.filter(a=>a.parish===parish).map(a=>a.ministry))).map(m=><option key={m}>{m}</option>)}</select></label>
  <label><span className={label}>Service year</span><select className={field} value={year} onChange={e=>{setYear(e.target.value);resetSelection()}}>{[2026,2027,2028,2029,2030,2031].map(y=><option key={y}>{y}</option>)}</select></label></div>
  <div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold">Select ministry assignments</h3><button className={secondary} type="button" disabled={!matching.length} onClick={()=>setSelected(matching.map(a=>a.id))}>Select all</button></div>
  {matching.length?<div className="grid gap-2 sm:grid-cols-2">{matching.map(a=><label key={a.id} className="flex min-h-11 items-center gap-3 border p-3 text-sm"><input type="checkbox" checked={selected.includes(a.id)} onChange={e=>setSelected(old=>e.target.checked?[...old,a.id]:old.filter(x=>x!==a.id))}/><span>{a.minister_label}</span></label>)}</div>:<p className="text-sm text-[color:var(--registry-muted)]">Select a parish and ministry to view the sample roster.</p>}
  <p className="text-sm">{selected.length} ministry assignments selected</p>
  <button type="submit" className={primary} disabled={busy||!selected.length}>Submit walk-in application</button>
 </form>}
 {(activeTab==="applications"||activeTab==="review")&&<>
 <div className="grid gap-3 sm:grid-cols-3">{(canAdmin&&activeTab==="review"?[["For review",apps.filter(a=>a.status==="submitted").length],["For correction",apps.filter(a=>a.status==="returned").length],["Documents approved",apps.filter(a=>a.status==="documents_approved").length]]:[["For review",apps.filter(a=>a.status==="submitted").length],["Awaiting payment",apps.filter(a=>a.status==="awaiting_payment"||a.status==="documents_approved").length],["Renewed",apps.filter(a=>a.status==="renewed").length]]).map(([name,value])=><div className="finance-panel finance-metric" key={name}><p className="text-sm text-[color:var(--registry-muted)]">{name}</p><p className={ebGaramond.className+" finance-metric-value"}>{value}</p></div>)}</div>
 <section className="finance-panel"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className={ebGaramond.className+" text-2xl"}>{canAdmin?(activeTab==="review"?"Legacy TEST review records":"Legacy TEST applications"):"Payment obligations"}</h2>{canAdmin&&<button className={primary} onClick={()=>setTab("intake")}>Walk-in application</button>}</div>
 {canAdmin&&<div className="mt-4 grid gap-3 sm:grid-cols-3"><label><span className={label}>Search parish or reference</span><input className={field} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Parish, ministry or reference"/></label><label><span className={label}>Submission source</span><select className={field} value={sourceFilter} onChange={e=>setSourceFilter(e.target.value)}><option value="all">All sources</option><option value="online_rehearsal">Online</option><option value="walk_in">Walk-in</option></select></label><label><span className={label}>Status</span><select className={field} value={queueFilter} onChange={e=>setQueueFilter(e.target.value)}><option value="all">All statuses</option><option value="submitted">For review</option><option value="returned">For correction</option>{activeTab!=="review"&&<><option value="documents_approved">Documents approved</option><option value="awaiting_payment">Awaiting payment</option><option value="renewed">Renewed</option></>}</select></label></div>}
 {canAdmin&&<div className="mt-4"><Phase16Review view={activeTab==="review"?"queue":"all"} source={sourceFilter} status={queueFilter} query={query}/></div>}
 <div className="mt-4 space-y-2">{visibleApps.map(a=><button key={a.id} type="button" aria-pressed={a.id===appId} onClick={()=>chooseApp(a)} className={"flex w-full flex-wrap justify-between gap-3 border p-4 text-left "+(a.id===appId?"border-[color:var(--registry-crimson)] bg-[color:var(--finance-soft-rose)]":"border-[color:var(--registry-hairline)]")}><span className="min-w-0"><strong>{a.parish}</strong><span className="mt-1 block text-sm">{a.ministry} · {a.service_year} · {a.members} ministers</span><span className="mt-1 block break-all text-xs text-[color:var(--registry-muted)]">{a.reference} · {a.channel==="walk_in"?"Walk-in":"Online"}</span></span><span className="text-sm"><strong>{statuses[a.status]??a.status}</strong><span className="mt-1 block tabular-nums">{money(a.due_centavos)}</span></span></button>)}{!visibleApps.length&&<p className="py-4 text-sm text-[color:var(--registry-muted)]">{canAdmin?"No applications match this view. Online submissions appear here automatically.":"No document-approved applications are ready for finance."}</p>}</div></section>
 {visibleChosen&&chosen&&<section className="finance-panel space-y-4"><h2 className={ebGaramond.className+" text-3xl"}>{chosen.parish}</h2><p className="text-sm">{chosen.ministry} · {chosen.service_year} · {chosen.members} ministers</p><p className="font-semibold">{statuses[chosen.status]}</p>
 {chosen.review_note&&<p className="text-sm">{chosen.review_note}</p>}
 {chosen.preferred_payment_method&&<p className="text-sm">Preferred payment: {chosen.preferred_payment_method==="QR"?"QR Ph":"Over the counter"}</p>}
 {canAdmin&&chosen.channel==="online_rehearsal"&&chosen.status==="returned"&&<p className="border-l-4 border-[color:var(--registry-crimson)] p-3 text-sm">Awaiting a corrected submission from the parish. Review resumes after resubmission.</p>}
 {canAdmin&&(chosen.status==="submitted"||(chosen.status==="returned"&&chosen.channel==="walk_in"))&&<div className="space-y-3"><h3 className="font-semibold">Document review</h3><div className="border border-[color:var(--registry-hairline)] p-4"><h4 className="font-semibold">Sample recommendation letter</h4><p className="mt-2 text-sm">For {chosen.parish}: the following fictional ministry assignments are presented for renewal for {chosen.service_year}. This is a generated rehearsal record, not a signed letter or private upload.</p>{chosen.sample_document_received&&<p className="mt-2 text-xs">Sample document received: {chosen.sample_document_received} · Retain until: {chosen.sample_document_retain_until}</p>}<ul className="mt-3 list-disc pl-5 text-sm">{chosen.roster?.map((name,i)=><li key={i}>{name}</li>)}</ul></div><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>Roster and recommendation letter reviewed and approved</label><button className={primary} disabled={busy||!reviewed} onClick={()=>void act("rc3_demo_review",{p_application_id:chosen.id,p_approved:true,p_note:""},"Documents approved. Available to COWL finance.")}>Approve documents</button><label className="block"><span className={label}>Return reason</span><textarea className={field} value={returnNote} maxLength={300} onChange={e=>setReturnNote(e.target.value)}/></label><button className={secondary} disabled={busy||returnNote.trim().length<10} onClick={()=>void act("rc3_demo_review",{p_application_id:chosen.id,p_approved:false,p_note:returnNote},"Application returned for correction.")}>Return application</button></div>}
 {canFinance&&chosen.status==="documents_approved"&&<div className="space-y-3"><h3 className="font-semibold">Payment assessment</h3>{chosen.reference.startsWith("RN-DEMO-RC32-")&&<Phase16Review view="finance" aggregateId={chosen.id}/>}<p className="text-sm">{chosen.members} ministers × {money(5000)} provisional TEST rate; exemptions not yet approved by COWL.</p><p className={ebGaramond.className+" text-3xl"}>{money(chosen.members*5000)}</p><button className={primary} disabled={busy} onClick={()=>void act("rc3_demo_authorize",{p_application_id:chosen.id},"Payment obligation authorized.")}>Authorize payment obligation</button></div>}
 {chosen.status==="awaiting_payment"&&<div className="space-y-3"><h3 className="font-semibold">Authorized payment obligation</h3>{canFinance&&chosen.reference.startsWith("RN-DEMO-RC32-")&&<Phase16Review view="finance" aggregateId={chosen.id}/>}<p className="text-sm">Outstanding balance: <strong>{money((chosen.due_centavos??0)-chosen.paid_centavos)}</strong></p><p className="break-all text-xs text-[color:var(--registry-muted)]">{chosen.payment_reference??"Linked reference unavailable"}</p>{canFinance&&chosen.payment_reference&&<div className="flex flex-wrap gap-2"><button className={primary} disabled={busy} onClick={()=>onOpenCollection?.(chosen.payment_reference!,"otc")}>Process OTC payment</button>{chosen.qr_prepared&&<button className={secondary} disabled={busy} onClick={()=>onOpenCollection?.(chosen.payment_reference!,"qr")}>Verify QR Ph payment</button>}</div>}{canAdmin&&chosen.payment_request_id&&!chosen.qr_prepared&&<button className={secondary} disabled={busy} onClick={()=>void act("rc3_demo_prepare_qr",{p_application_id:chosen.id},"Synthetic QR claim prepared for COWL verification.")}>Prepare synthetic QR claim</button>}{chosen.qr_prepared&&<p className="text-sm text-[color:var(--registry-muted)]">Synthetic QR claim awaiting independent finance verification.</p>}</div>}
 {chosen.status==="renewed"&&<p className="border-l-4 border-[color:var(--finance-success)] bg-[color:var(--finance-success-surface)] p-3 text-sm text-[color:var(--finance-success)]">Documents approved and {money(chosen.paid_centavos)} settled. Sample assignments renewed for one calendar year.</p>}
 <h3 className="font-semibold">Application history</h3><ul className="space-y-2 text-sm">{data.events.filter(e=>e.application_id===chosen.id).map(e=><li key={e.id} className="border-b pb-2">{e.action.replaceAll("_"," ")} · {new Date(e.happened_at).toLocaleString("en-PH",{timeZone:"Asia/Manila"})}</li>)}</ul>
 </section>}</>}
 {activeTab==="history"&&canAdmin&&<Phase16Review view="history"/>}
 {activeTab==="history"&&canAdmin&&<section className="finance-panel"><h2 className={ebGaramond.className+" text-2xl"}>Application history</h2><div className="mt-3 divide-y">{data.events.map(e=><div key={e.id} className="py-3 text-sm"><p className="font-medium">{apps.find(a=>a.id===e.application_id)?.parish??"Application"} · {e.action.replaceAll("_"," ")}</p><p className="text-xs text-[color:var(--registry-muted)]">{new Date(e.happened_at).toLocaleString("en-PH",{timeZone:"Asia/Manila"})}</p></div>)}</div></section>}
 {activeTab==="roster"&&canAdmin&&<section className="finance-panel"><h2 className={ebGaramond.className+" text-2xl"}>Independent sample assignments</h2><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead><tr>{["Minister","Parish","Ministry","Renewal date","Expiration date","Certificate eligibility (sample)"].map(h=><th className="p-2" key={h}>{h}</th>)}</tr></thead><tbody>{assignments.map(a=><tr key={a.id} className="border-t"><td className="p-2">{a.minister_label}</td><td className="p-2">{a.parish}</td><td className="p-2">{a.ministry}</td><td className="p-2">{a.renewal_date??"—"}</td><td className="p-2">{a.expiration_date??"—"}</td><td className="p-2">{a.renewal_date&&a.expiration_date?"Validated sample assignment; official issuance disabled":"Not yet validated"}</td></tr>)}</tbody></table></div></section>}
 </>}
 </div>;
 if(embedded)return content;
 return <PortalShell title="Registry Administration" subtitle="Liturgical Ministry Registry · Test" homeHref="/demo/finance/renewals" navigationLabel="Registry administration navigation"
 groups={[{name:"Member Management",items:[{id:"applications",label:"Renewal Processing Desk",icon:ClipboardList,active:activeTab==="applications",onSelect:()=>{setTab("applications");setQueueFilter("all");setSourceFilter("all");setQuery("")}},{id:"intake",label:"Walk-in Application",icon:PenLine,active:activeTab==="intake",onSelect:()=>setTab("intake")},{id:"review",label:"Review Queue",icon:Inbox,active:activeTab==="review",onSelect:()=>{setTab("review");setQueueFilter("all");setSourceFilter("all");setQuery("")}},{id:"history",label:"Application History",icon:History,active:activeTab==="history",onSelect:()=>setTab("history")},{id:"roster",label:"Sample Ministry Roster",icon:Users,active:activeTab==="roster",onSelect:()=>setTab("roster")}]}]}
 footer={<div className="space-y-2"><p className="truncate text-xs text-white/85">{email}</p><Link className="block text-sm text-white underline" href="/demo/finance">Switch workspace</Link><button onClick={()=>void signOut()} className="inline-flex min-h-11 items-center gap-2 text-sm text-white"><LogOut className="h-4 w-4"/>Sign out</button></div>}
 compactFooter={<button aria-label="Sign out" onClick={()=>void signOut()} className="grid h-11 w-11 place-items-center text-white"><LogOut className="h-5 w-5"/></button>}>{content}</PortalShell>;
}
