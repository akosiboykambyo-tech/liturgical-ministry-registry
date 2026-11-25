"use client";
import {useCallback,useEffect,useMemo,useRef,useState,type FormEvent} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {ebGaramond} from "@/app/fonts";
import {ClipboardList,Receipt,RefreshCw,LogOut,Users,Wallet} from "@/components/phosphor-icons";
import PortalShell from "@/components/financial-stewardship/demo-portal-shell";
import {getFinancialStagingClient} from "@/lib/financial-stewardship/staging-client";

type Assignment={id:string;minister_label:string;parish:string;ministry:string;renewal_date:string|null;expiration_date:string|null};
type Application={id:string;reference:string;parish:string;ministry:string;service_year:number;channel:"online_rehearsal"|"walk_in";status:string;members:number;due_centavos:number|null;paid_centavos:number;review_note:string|null;renewed_at:string|null};
type Snapshot={roles:{admin:boolean;finance:boolean};assignments:Assignment[];applications:Application[];events:{id:number;application_id:string;action:string;happened_at:string}[]};
const primary="inline-flex min-h-11 items-center justify-center gap-2 rounded-sm bg-[color:var(--registry-button)] px-4 py-2 text-sm font-semibold text-white hover:bg-[color:var(--registry-oxblood)] disabled:opacity-40";
const secondary="inline-flex min-h-11 items-center justify-center gap-2 rounded-sm border border-[color:var(--finance-control-border)] bg-white px-4 py-2 text-sm font-semibold disabled:opacity-40";
const field="min-h-11 w-full border border-[color:var(--finance-control-border)] bg-white px-3 py-2 text-sm";
const label="mb-1 block text-xs font-semibold text-[color:var(--registry-muted)]";
const money=(v:number|null)=>v===null?"—":new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP"}).format(v/100);
const statuses:Record<string,string>={submitted:"For review",documents_approved:"Documents approved",awaiting_payment:"Awaiting payment",renewed:"Renewed",returned:"Returned for correction"};
export default function RenewalDesk(){
 const client=useMemo(()=>getFinancialStagingClient(),[]);
 const router=useRouter();
 const [data,setData]=useState<Snapshot|null>(null),[email,setEmail]=useState(""),[error,setError]=useState(""),[notice,setNotice]=useState(""),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const inFlight=useRef(false);
 const [tab,setTab]=useState<"applications"|"intake"|"roster">("applications");
 const [channel,setChannel]=useState<"walk_in"|"online_rehearsal">("walk_in");
 const [year,setYear]=useState("2027"),[parish,setParish]=useState(""),[ministry,setMinistry]=useState(""),[selected,setSelected]=useState<string[]>([]);
 const [appId,setAppId]=useState(""),[reviewed,setReviewed]=useState(false),[returnNote,setReturnNote]=useState(""),[amount,setAmount]=useState(""),[confirmed,setConfirmed]=useState(false);
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
     setData(result.data as Snapshot);
   }catch(e){setError(e instanceof Error?e.message:"Unable to load renewal applications.");}
   finally{setLoading(false);}
 },[client,router]);
 useEffect(()=>{void load()},[load]);
 async function act(name:string,params:Record<string,unknown>,message:string){
   if(!client||!data||busy||loading||inFlight.current)return;
   inFlight.current=true;setBusy(true);setError("");setNotice("");
   try{
     const r=await client.rpc(name,params);if(r.error)throw Error(r.error.message);
     if(name==="rc3_demo_submit"){setAppId(String(r.data));setSelected([]);setTab("applications");}
     setReviewed(false);setConfirmed(false);setReturnNote("");setAmount("");setNotice(message);
     await load();
   }catch(e){setError(e instanceof Error?e.message:"Operation rejected. Refresh before retrying.");}
   finally{setBusy(false);inFlight.current=false;}
 }
 async function signOut(){setData(null);if(client)await client.auth.signOut();router.replace("/demo/finance")}
 const roles=data?.roles;
 const apps=data?.applications??[],assignments=data?.assignments??[];
 const chosen=apps.find(a=>a.id===appId);
 const matching=assignments.filter(a=>a.parish===parish&&a.ministry===ministry);
 const parsed=/^(0|[1-9]\d{0,7})(\.\d{1,2})?$/.test(amount.trim())?Math.round(Number(amount)*100):null;
 const activeTab=roles?.admin?tab:"applications";
 const resetSelection=()=>{setSelected([]);};
 function chooseApp(a:Application){setAppId(a.id);setReviewed(false);setConfirmed(false);setReturnNote("");setAmount(a.due_centavos===null?"":(a.due_centavos/100).toFixed(2));}
 function submit(e:FormEvent){e.preventDefault();void act("rc3_demo_submit",{p_channel:channel,p_year:Number(year),p_assignment_ids:selected},"Application submitted for review.");}
 return <PortalShell title={roles?.admin?"Registry Administration":"COWL Portal"} subtitle="Renewal Processing Desk" homeHref="/demo/finance/renewals" navigationLabel="Renewal Processing navigation"
 groups={[{items:[{id:"applications",label:"Renewal Applications",icon:ClipboardList,active:activeTab==="applications",onSelect:()=>setTab("applications")},...(roles?.admin?[{id:"intake",label:"New Application",icon:Users,active:activeTab==="intake",onSelect:()=>setTab("intake")},{id:"roster",label:"Sample Ministry Roster",icon:Receipt,active:activeTab==="roster",onSelect:()=>setTab("roster")}]:[]),...(roles?.finance?[{id:"finance",label:"RC2 Financial Stewardship",icon:Wallet,href:"/demo/finance/cowl"}]:[])]}]}
 footer={<div className="space-y-2"><p className="truncate text-xs text-white/85">{email}</p><Link className="block text-sm text-white underline" href="/demo/finance">Switch workspace</Link><button onClick={()=>void signOut()} className="inline-flex min-h-11 items-center gap-2 text-sm text-white"><LogOut className="h-4 w-4"/>Sign out</button></div>}
 compactFooter={<button aria-label="Sign out" onClick={()=>void signOut()} className="grid h-11 w-11 place-items-center text-white"><LogOut className="h-5 w-5"/></button>}>
 <div className="finance-content">
 <header className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-widest text-[color:var(--registry-crimson)]">Renewal Processing Desk</p><h1 className={ebGaramond.className+" finance-page-title"}>{activeTab==="intake"?"New renewal application":activeTab==="roster"?"Sample Ministry Roster":"Renewal Applications"}</h1><p className="mt-2 text-sm text-[color:var(--registry-muted)]">Review applications, assess approved obligations and track renewal completion.</p></div><button type="button" className={secondary} disabled={busy||loading} onClick={()=>void load()}><RefreshCw className="h-4 w-4"/>Refresh</button></header>
 {error&&<p role="alert" className="finance-panel border-[color:var(--finance-error-border)] text-[color:var(--registry-error)]">{error}</p>}
 {notice&&<p role="status" className="finance-panel text-[color:var(--finance-success)]">{notice}</p>}
 {loading&&<p role="status">Loading renewal records…</p>}
 {!loading&&data&&<>
 {activeTab==="intake"&&roles?.admin&&<form className="finance-panel space-y-4" onSubmit={submit}>
  <h2 className={ebGaramond.className+" text-3xl"}>Application intake</h2>
  <fieldset><legend className="font-semibold text-sm">Submission channel</legend><div className="mt-2 grid gap-3 sm:grid-cols-2">{[["walk_in","Walk-in / assisted"],["online_rehearsal","Online submission rehearsal"]].map(([id,name])=><label key={id} className="flex min-h-11 items-center gap-2 border p-3 text-sm"><input type="radio" checked={channel===id} onChange={()=>setChannel(id as typeof channel)} name="channel"/>{name}</label>)}</div></fieldset>
  <div className="grid gap-3 sm:grid-cols-3"><label><span className={label}>Parish</span><select className={field} value={parish} required onChange={e=>{setParish(e.target.value);setMinistry("");resetSelection()}}><option value="">Select parish</option>{Array.from(new Set(assignments.map(a=>a.parish))).map(p=><option key={p}>{p}</option>)}</select></label>
  <label><span className={label}>Ministry</span><select className={field} required value={ministry} onChange={e=>{setMinistry(e.target.value);resetSelection()}}><option value="">Select ministry</option>{Array.from(new Set(assignments.filter(a=>a.parish===parish).map(a=>a.ministry))).map(m=><option key={m}>{m}</option>)}</select></label>
  <label><span className={label}>Service year</span><select className={field} value={year} onChange={e=>{setYear(e.target.value);resetSelection()}}>{[2026,2027,2028,2029,2030,2031].map(y=><option key={y}>{y}</option>)}</select></label></div>
  <div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold">Select ministry assignments</h3><button className={secondary} type="button" disabled={!matching.length} onClick={()=>setSelected(matching.map(a=>a.id))}>Select all</button></div>
  {matching.length?<div className="grid gap-2 sm:grid-cols-2">{matching.map(a=><label key={a.id} className="flex min-h-11 items-center gap-3 border p-3 text-sm"><input type="checkbox" checked={selected.includes(a.id)} onChange={e=>setSelected(old=>e.target.checked?[...old,a.id]:old.filter(x=>x!==a.id))}/><span>{a.minister_label}</span></label>)}</div>:<p className="text-sm text-[color:var(--registry-muted)]">Select a parish and ministry to view the sample roster.</p>}
  <p className="text-sm">{selected.length} ministry assignments selected</p>
  <button type="submit" className={primary} disabled={busy||!selected.length}>Submit application</button>
 </form>}
 {activeTab==="applications"&&<>
 <div className="grid gap-3 sm:grid-cols-3">{[["For review",apps.filter(a=>a.status==="submitted"||a.status==="returned").length],["Awaiting payment",apps.filter(a=>a.status==="awaiting_payment"||a.status==="documents_approved").length],["Renewed",apps.filter(a=>a.status==="renewed").length]].map(([name,value])=><div className="finance-panel finance-metric" key={name}><p className="text-sm text-[color:var(--registry-muted)]">{name}</p><p className={ebGaramond.className+" finance-metric-value"}>{value}</p></div>)}</div>
 <section className="finance-panel"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className={ebGaramond.className+" text-2xl"}>Application queue</h2>{roles?.admin&&<button className={primary} onClick={()=>setTab("intake")}>New application</button>}</div>
 <div className="mt-4 space-y-2">{apps.map(a=><button key={a.id} type="button" aria-pressed={a.id===appId} onClick={()=>chooseApp(a)} className={"flex w-full flex-wrap justify-between gap-3 border p-4 text-left "+(a.id===appId?"border-[color:var(--registry-crimson)] bg-[color:var(--finance-soft-rose)]":"border-[color:var(--registry-hairline)]")}><span className="min-w-0"><strong>{a.parish}</strong><span className="mt-1 block text-sm">{a.ministry} · {a.service_year} · {a.members} ministers</span><span className="mt-1 block break-all text-xs text-[color:var(--registry-muted)]">{a.reference} · {a.channel==="walk_in"?"Walk-in":"Online rehearsal"}</span></span><span className="text-sm"><strong>{statuses[a.status]??a.status}</strong><span className="mt-1 block tabular-nums">{money(a.due_centavos)}</span></span></button>)}{!apps.length&&<p className="py-4 text-sm text-[color:var(--registry-muted)]">{roles?.admin?"No applications yet. Create an online rehearsal or walk-in application.":"No document-approved applications are ready for finance."}</p>}</div></section>
 {chosen&&<section className="finance-panel space-y-4"><h2 className={ebGaramond.className+" text-3xl"}>{chosen.parish}</h2><p className="text-sm">{chosen.ministry} · {chosen.service_year} · {chosen.members} ministers</p><p className="font-semibold">{statuses[chosen.status]}</p>
 {chosen.review_note&&<p className="text-sm">{chosen.review_note}</p>}
 {roles?.admin&&["submitted","returned"].includes(chosen.status)&&<div className="space-y-3"><h3 className="font-semibold">Document review</h3><p className="text-sm text-[color:var(--registry-muted)]">Simulated recommendation letter and roster review. No uploaded document is inspected in this rehearsal.</p><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>Roster and recommendation letter reviewed and approved</label><button className={primary} disabled={busy||!reviewed} onClick={()=>void act("rc3_demo_review",{p_application_id:chosen.id,p_approved:true,p_note:""},"Documents approved. Available to COWL finance.")}>Approve documents</button><label className="block"><span className={label}>Return reason</span><textarea className={field} value={returnNote} maxLength={300} onChange={e=>setReturnNote(e.target.value)}/></label><button className={secondary} disabled={busy||returnNote.trim().length<10} onClick={()=>void act("rc3_demo_review",{p_application_id:chosen.id,p_approved:false,p_note:returnNote},"Application returned for correction.")}>Return application</button></div>}
 {roles?.finance&&chosen.status==="documents_approved"&&<div className="space-y-3"><h3 className="font-semibold">Payment assessment</h3><p className="text-sm">{chosen.members} ministers × {money(5000)} sample rate</p><p className={ebGaramond.className+" text-3xl"}>{money(chosen.members*5000)}</p><button className={primary} disabled={busy} onClick={()=>void act("rc3_demo_authorize",{p_application_id:chosen.id},"Payment obligation authorized.")}>Authorize payment obligation</button></div>}
 {roles?.finance&&chosen.status==="awaiting_payment"&&<form className="space-y-3" onSubmit={e=>{e.preventDefault();void act("rc3_demo_pay",{p_application_id:chosen.id,p_amount_centavos:parsed,p_confirmed:confirmed},"OTC payment recorded and sample ministry assignments validated.")}}><h3 className="font-semibold">OTC payment</h3><p className="text-sm">Approved balance: <strong>{money(chosen.due_centavos)}</strong></p><label className="block"><span className={label}>Amount received (PHP)</span><input className={field} value={amount} inputMode="decimal" required onChange={e=>{setAmount(e.target.value);setConfirmed(false)}}/></label><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>Confirm the simulated counted amount</label><button type="submit" className={primary} disabled={busy||!confirmed||parsed!==chosen.due_centavos}>Record payment and validate renewal</button></form>}
 {chosen.status==="renewed"&&<p className="border-l-4 border-[color:var(--finance-success)] bg-[color:var(--finance-success-surface)] p-3 text-sm text-[color:var(--finance-success)]">Documents approved and {money(chosen.paid_centavos)} settled. Sample assignments renewed for one calendar year.</p>}
 <h3 className="font-semibold">Application history</h3><ul className="space-y-2 text-sm">{data.events.filter(e=>e.application_id===chosen.id).map(e=><li key={e.id} className="border-b pb-2">{e.action.replaceAll("_"," ")} · {new Date(e.happened_at).toLocaleString("en-PH",{timeZone:"Asia/Manila"})}</li>)}</ul>
 </section>}</>}
 {activeTab==="roster"&&roles?.admin&&<section className="finance-panel"><h2 className={ebGaramond.className+" text-2xl"}>Independent sample assignments</h2><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead><tr>{["Minister","Parish","Ministry","Renewal date","Expiration date"].map(h=><th className="p-2" key={h}>{h}</th>)}</tr></thead><tbody>{assignments.map(a=><tr key={a.id} className="border-t"><td className="p-2">{a.minister_label}</td><td className="p-2">{a.parish}</td><td className="p-2">{a.ministry}</td><td className="p-2">{a.renewal_date??"—"}</td><td className="p-2">{a.expiration_date??"—"}</td></tr>)}</tbody></table></div></section>}
 </>}
 </div></PortalShell>
}
