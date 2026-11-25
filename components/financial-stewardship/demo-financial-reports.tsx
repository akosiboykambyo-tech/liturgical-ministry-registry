"use client";
import {useEffect,useState} from "react";
import {getFinancialStagingClient} from "@/lib/financial-stewardship/staging-client";
import {ebGaramond} from "@/app/fonts";
type Issue={id:string;receipt_number_id:string;issue_date:string;payer_written_name:string;ministry_written_name:string;amount_centavos:number};
type NumberRow={id:string;printed_no:string;status:string;series_id:string};
type Series={id:string;series_code:string};
type Collection={id:string;amount_centavos:number;status:string};
type Remittance={id:string;remittance_reference:string;declared_amount_centavos:number;status:string};
type Item={collection_id:string;remittance_id:string};
type Audit={event_id:number;event_time:string;event_kind:string;event_action:string;reference:string|null};
type Data={audit:Audit[];issues:Issue[];numbers:NumberRow[];series:Series[];collections:Collection[];remittances:Remittance[];items:Item[]};
const fmt=(n:number)=>new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP"}).format(n/100);
const sum=(rows:Collection[])=>rows.reduce((a,b)=>a+Number(b.amount_centavos),0);
export default function DemoFinancialReports({registerOnly=false}:{registerOnly?:boolean}){
 const [data,setData]=useState<Data|null>(null),[error,setError]=useState(""),[tick,setTick]=useState(0);
 useEffect(()=>{let alive=true;setData(null);setError("");const c=getFinancialStagingClient();if(!c){setError("TEST client unavailable.");return;}
 const load=async()=>{try{
 const [i,n,s,a,r,m,audit]=await Promise.all([c.from("fs_receipt_issues").select("id,receipt_number_id,issue_date,payer_written_name,ministry_written_name,amount_centavos").order("issue_date",{ascending:false}).limit(1000),c.from("fs_receipt_numbers").select("id,printed_no,status,series_id").limit(1000),c.from("fs_receipt_series").select("id,series_code"),registerOnly?Promise.resolve({data:[],error:null}):c.from("fs_collections").select("id,amount_centavos,status").limit(1000),registerOnly?Promise.resolve({data:[],error:null}):c.from("fs_remittances").select("id,remittance_reference,declared_amount_centavos,status").limit(1000),registerOnly?Promise.resolve({data:[],error:null}):c.from("fs_remittance_items").select("collection_id,remittance_id").limit(1000),registerOnly?Promise.resolve({data:[],error:null}):c.rpc("fs_demo_audit_history")]);
 const fail=[i,n,s,a,r,m,audit].find(x=>x.error);if(fail?.error)throw Error(fail.error.message);
 if([i,n,a,r,m].some(x=>(x.data??[]).length>=1000))throw Error("Rehearsal dataset too large for this report; totals are not displayed.");
 if(alive)setData({audit:audit.data??[],issues:i.data??[],numbers:n.data??[],series:s.data??[],collections:a.data??[],remittances:r.data??[],items:m.data??[]});
 }catch(e){if(alive)setError(e instanceof Error?e.message:"Unable to load TEST records.");}};
 void load();return()=>{alive=false};},[tick,registerOnly]);
 const panel="finance-panel";
 if(error)return <section className={panel} role="alert">{error} <button className="underline" onClick={()=>setTick(x=>x+1)}>Retry</button></section>;
 if(!data)return <p role="status" className={panel}>Loading fictional TEST records…</p>;
 const posted=data.collections.filter(x=>x.status==="posted");
 const submitted=new Set(data.items.map(x=>x.collection_id));
 const confirmedIds=new Set(data.remittances.filter(r=>r.status==="curia_confirmed").map(r=>r.id));
 const confirmed=new Set(data.items.filter(i=>confirmedIds.has(i.remittance_id)).map(i=>i.collection_id));
 const paid=sum(posted),received=sum(posted.filter(x=>confirmed.has(x.id))),pending=sum(posted.filter(x=>submitted.has(x.id)&&!confirmed.has(x.id))),held=sum(posted.filter(x=>!submitted.has(x.id)));
 return <div className="space-y-4"><div className="flex flex-wrap items-center justify-end gap-3"><button type="button" onClick={()=>setTick(x=>x+1)} className="min-h-11 border border-[color:var(--registry-crimson)] px-4 text-sm font-semibold text-[color:var(--registry-crimson)]">Refresh report</button></div>
 {!registerOnly&&<><section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[["Posted collections",paid],["Curia confirmed",received],["Submitted / pending",pending],["Not submitted",held]].map(([label,v])=><div className={panel+" finance-metric"} key={label}><p className="text-sm text-[color:var(--registry-muted)]">{label}</p><p className={ebGaramond.className+" mt-2 text-3xl tabular-nums"}>{fmt(Number(v))}</p></div>)}</section><section className={panel}><h2 className={ebGaramond.className+" text-2xl"}>Remittance register</h2><div className="overflow-x-auto"><table className="mt-3 w-full text-left text-sm"><thead><tr><th className="p-2">Reference</th><th className="p-2">Amount</th><th className="p-2">Status</th></tr></thead><tbody>{data.remittances.map(r=><tr key={r.id} className="border-t"><td className="p-2">{r.remittance_reference}</td><td className="p-2">{fmt(Number(r.declared_amount_centavos))}</td><td className="p-2">{r.status.replaceAll("_"," ")}</td></tr>)}</tbody></table></div></section></>}
 <section className={panel}><h2 className={ebGaramond.className+" text-2xl"}>TEST receipt register</h2><p className="text-sm text-[color:var(--registry-muted)]">Recorded TEST issues only; opening stock is not revenue. No official printing.</p><div className="overflow-x-auto"><table className="mt-3 w-full min-w-[650px] text-left text-sm"><thead><tr>{["Series / serial","Date","Fictional payer","Particulars","Amount"].map(h=><th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>{data.issues.map(i=>{const n=data.numbers.find(n=>n.id===i.receipt_number_id);return <tr className="border-t" key={i.id}><td className="p-2">{data.series.find(s=>s.id===n?.series_id)?.series_code??"—"} / {n?.printed_no??"—"}</td><td className="p-2">{i.issue_date}</td><td className="p-2">{i.payer_written_name}</td><td className="p-2">{i.ministry_written_name}</td><td className="p-2">{fmt(Number(i.amount_centavos))}</td></tr>})}{!data.issues.length&&<tr><td colSpan={5} className="p-4">No TEST receipts recorded.</td></tr>}</tbody></table></div></section>
 {!registerOnly&&<section className={panel}><h2 className={ebGaramond.className+" text-2xl"}>Transaction history</h2><p className="mt-1 text-sm text-[color:var(--registry-muted)]">Latest 200 scoped TEST audit events. Actor identities and private evidence metadata are not exposed.</p><div className="overflow-x-auto"><table className="mt-3 w-full min-w-[620px] text-left text-sm"><thead><tr>{["Date and time","Record type","Action","Reference"].map(h=><th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>{data.audit.map(a=><tr key={a.event_id} className="border-t"><td className="p-2">{new Date(a.event_time).toLocaleString("en-PH",{timeZone:"Asia/Manila"})}</td><td className="p-2">{a.event_kind.replaceAll("_"," ")}</td><td className="p-2">{a.event_action.replaceAll("_"," ")}</td><td className="p-2 break-all">{a.reference??"—"}</td></tr>)}{!data.audit.length&&<tr><td colSpan={4} className="p-4">No scoped TEST events.</td></tr>}</tbody></table></div></section>}</div>
}
