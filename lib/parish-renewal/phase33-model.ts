import {MINISTRIES,type Ministry} from "@/lib/constants";
import {matchRenewalRows,reconcileRenewal,type Incoming,type Choice,type Decision,type Match} from "./phase16-reconciliation";
import {fictionalRoster,type Row} from "./phase16-model";
export type Method="OTC"|"QR";
export type Kind="original"|"supplemental";
export type Channel="walk_in"|"online_rehearsal";
export type ProposalKind="renew"|"hold"|"no"|"new_member"|"ministry_assignment"|"identity_review";
export type Proposal={assignment_id?:string|null;first_name?:string;last_name?:string;proposal:ProposalKind;proposed_first?:string|null;proposed_last?:string|null;source?:"csv"|"manual"};
export type Item=Proposal&{id:string;first_name:string;last_name:string;decision:"pending"|"approved"|"rejected"|"excluded";note?:string|null;reservation_released_at?:string|null};
export type Batch={id:string;cycle_id:string;reference:string;ministry:Ministry;kind:Kind;channel:Channel;parent_id:string|null;revision:number;status:"submitted"|"returned"|"reviewed"|"closed_no_charge";return_note:string|null;preferred_method:Method;letter_name:string|null;letter_reviewed:boolean;zero_declaration:boolean;aggregate_id:string|null;financial_status:string|null;due_centavos:number|null;paid_centavos:number|null;payment_reference:string|null;approved_count:number;batch_amount_centavos:number;qr_prepared:boolean;qr_requested?:boolean;items:Item[]};
export type Payload={items:Proposal[];method:Method;confirmed:boolean;letter:string|null;zero:boolean;roster_confirmed?:boolean;letter_confirmed?:boolean};
export type Draft={id:string;cycle_id:string;ministry:Ministry;kind:Kind;channel:Channel;revision:number;payload:Payload;replace_batch:string|null;state:"draft"|"submitted"|"superseded";submitted_batch?:string|null};
export type Advance={id:string;ministry:Ministry;amount_centavos:number;declared_count:number;allocated_application:string|null;discrepancy_note:string|null;payment_reference:string;receipt_recorded:boolean;collection_id:string};
export type Cycle={cycle:string|null;roles:{admin:boolean;finance:boolean;coordinator?:boolean};roster:Row[];batches:Batch[];drafts:Draft[];history:{id:number;batch_id:string|null;action:string;at:string}[];advances:Advance[]};
export const emptyCycle=():Cycle=>({cycle:null,roles:{admin:false,finance:false},roster:[],batches:[],drafts:[],history:[],advances:[]});
export const normalizeName=(s:string)=>s.normalize("NFC").trim().replace(/\s+/g," ").toLowerCase();
export const nameKey=(first:string,last:string)=>JSON.stringify([normalizeName(first),normalizeName(last)]);
export const validName=(s:string)=>s.trim().length>0&&s.trim().length<=100&&!/^[=+@-]/.test(s.trim())&&!/[\u0000-\u001f\u007f]/.test(s);
export function activeClaims(batches:Batch[],replace?:string|null){return batches.filter(b=>b.id!==replace).flatMap(b=>b.items.filter(i=>i.proposal!=="no"&&!i.reservation_released_at).map(i=>({batch:b,item:i})));}
export function lockedClaim(cycle:Cycle, ministry:Ministry,first:string,last:string,id?:string,replace?:string|null){
 return activeClaims(cycle.batches,replace).find(({batch,item})=>batch.ministry===ministry&&(id&&item.assignment_id===id||nameKey(item.first_name,item.last_name)===nameKey(first,last)));
}
export function editableRoster(cycle:Cycle,draft:Draft){return cycle.roster.filter(r=>!lockedClaim(cycle,r.ministry,r.first,r.last,r.id,draft.replace_batch));}
export function canSupplement(b:Batch|undefined){return !!b&&(b.status==="closed_no_charge"||b.status==="reviewed"&&["awaiting_payment","renewed"].includes(b.financial_status??""));}
export function statusLabel(b:Batch){if(b.financial_status==="renewed")return "Renewed";if(b.financial_status==="awaiting_payment")return "Awaiting full payment";if(b.financial_status==="documents_approved")return "Awaiting finance authorization";if(b.status==="closed_no_charge")return "Closed · no charge";if(b.status==="reviewed")return "Reviewed · awaiting assessment";if(b.status==="returned")return "Returned for correction";return "For Registry review";}
export function parishStatusLabel(b:Batch){if(b.financial_status==="renewed")return "Submitted · validated";if(b.status==="submitted")return "Submitted · for Registry review";return statusLabel(b);}
export function cycleTotals(c:Cycle){const claims=c.batches.flatMap(b=>b.items.filter(i=>i.proposal!=="no"&&i.decision!=="excluded").map(i=>({key:i.assignment_id??JSON.stringify([b.ministry,nameKey(i.first_name,i.last_name)]),assignment:i.assignment_id})));const submitted=new Set(claims.map(i=>i.key));const submittedRoster=new Set(claims.filter(i=>i.assignment&&c.roster.some(r=>r.id===i.assignment)).map(i=>i.assignment));const renewed=new Set(c.batches.filter(b=>b.financial_status==="renewed").flatMap(b=>b.items.filter(i=>i.decision==="approved").map(i=>i.assignment_id??i.id)));const groups=new Map<string,Batch>();for(const b of c.batches)if(b.aggregate_id&&!groups.has(b.aggregate_id))groups.set(b.aggregate_id,b);return {submitted:submitted.size,notSubmitted:Math.max(0,c.roster.length-submittedRoster.size),renewed:renewed.size,registered:c.roster.length,completed:MINISTRIES.filter(m=>{const b=c.batches.find(b=>b.ministry===m&&b.kind==="original");return b&&(b.financial_status==="renewed"||b.status==="closed_no_charge")}).length,due:Array.from(groups.values()).reduce((n,b)=>n+(b.due_centavos??0),0),paid:Array.from(groups.values()).reduce((n,b)=>n+(b.paid_centavos??0),0),unallocated:c.advances.filter(a=>!a.allocated_application).reduce((n,a)=>n+a.amount_centavos,0)};}
export function makePayload(items:Proposal[]=[],method:Method="OTC"):Payload{return {items,method,confirmed:false,letter:null,zero:false,roster_confirmed:false,letter_confirmed:false};}
export function isReady(p:Payload,kind:Kind){const n=p.items.filter(i=>i.proposal!=="no").length;return !!p.roster_confirmed&&!!p.letter_confirmed&&(n>0?!!p.letter&&!p.zero:kind==="original"&&p.zero&&!p.letter);}
export function estimate(p:Payload){return p.items.filter(i=>i.proposal==="renew"||i.proposal==="new_member"||i.proposal==="ministry_assignment").length*5000;}
export type Classified={match:Match;kind:"editable"|"prior"|"other";prior?:{batch:Batch;item:Item}};
export function classifyCsv(rows:Incoming[],cycle:Cycle,draft:Draft):Classified[]{
 return matchRenewalRows(rows,cycle.roster).map(match=>{const r=match.incoming;const prior=lockedClaim(cycle,r.ministry,r.first,r.last,match.kind==="exact"?match.candidates[0]?.id:undefined,draft.replace_batch);return {match,kind:prior?"prior":r.ministry===draft.ministry?"editable":"other",prior};});
}
export function csvApply(rows:Incoming[],cycle:Cycle,draft:Draft,choices:Record<number,Choice>,omissions:Record<string,Decision>,confirmed:boolean):Proposal[]{
 const classified=classifyCsv(rows,cycle,draft),active=classified.filter(x=>x.kind==="editable").map(x=>x.match.incoming);
 if(!active.length)throw Error("No editable rows for this ministry. Existing submissions are unchanged.");
 const eligible=editableRoster(cycle,draft),same=eligible.filter(r=>r.ministry===draft.ministry);
 const allOmissions=draft.kind==="supplemental"?Object.fromEntries(same.map(r=>[r.id,"no" as Decision])):omissions;
 const result=reconcileRenewal({rows:active,roster:eligible,scope:[draft.ministry],choices,omissions:allOmissions,confirmed});
 const items:Proposal[]=same.flatMap(r=>{const d=result.decisions[r.id];return d&&(draft.kind==="original"||d!=="no")?[{assignment_id:r.id,proposal:d,source:"csv" as const}]:[];});
 for(const request of result.requests){const selected=choices[request.row.row];if(selected?.kind==="request_match"){const at=items.findIndex(i=>i.assignment_id===selected.id);if(at<0)throw Error("Correction candidate no longer editable.");items[at]={...items[at],proposal:"identity_review",proposed_first:request.row.first,proposed_last:request.row.last};}else items.push({first_name:request.row.first,last_name:request.row.last,proposal:request.kind,source:"csv"});}
 // Manual new names are retained; repeated CSV requests cannot silently duplicate them.
 const retained=draft.payload.items.filter(i=>!i.assignment_id&&i.source!=="csv");
 const merged=[...items,...retained];const keys=merged.filter(i=>!i.assignment_id).map(i=>nameKey(i.first_name??"",i.last_name??""));
 if(new Set(keys).size!==keys.length)throw Error("CSV repeats a manually proposed name. Remove the duplicate first.");
 return merged;
}
export function practiceCycle(parish:string,year:number):Cycle{
 const roster=fictionalRoster(parish),ministry=MINISTRIES.find(m=>m==="Ministry of Lectors and Commentators")??MINISTRIES[3],cycle="LOCAL-"+parish+"-"+year;
 const rows=roster.filter(r=>r.ministry===ministry);
 const items:Item[]=rows.map((r,i)=>({id:cycle+"-i"+i,assignment_id:r.id,first_name:r.first,last_name:r.last,proposal:i<3?"renew":"no",decision:i<3?"approved":"excluded"}));
 const batch:Batch={id:cycle+"-walkin",cycle_id:cycle,reference:"LOCAL-PRACTICE-WALKIN",ministry,kind:"original",channel:"walk_in",parent_id:null,revision:1,status:"reviewed",return_note:null,preferred_method:"OTC",letter_name:"SAMPLE-MLC-recommendation.pdf",letter_reviewed:true,zero_declaration:false,aggregate_id:cycle+"-payment",financial_status:"renewed",due_centavos:15000,paid_centavos:15000,payment_reference:"LOCAL-PRACTICE-OTC-001",approved_count:3,batch_amount_centavos:15000,qr_prepared:false,items};
 return {...emptyCycle(),cycle,roster,batches:[batch]};
}

/** Shared parish roster only prepares independent ministry drafts. No submission or billing occurs here. */
export function parishRosterTargets(c:Cycle):Draft[]{
 return MINISTRIES.flatMap(ministry=>{
  const orig=c.batches.find(b=>b.ministry===ministry&&b.kind==="original");
  const supplements=c.batches.filter(b=>b.ministry===ministry&&b.kind==="supplemental");
  // Corrections retain their existing reference and are opened from submission history.
  if(orig?.status==="returned"||supplements.some(b=>b.status==="returned"))return [];
  const kind:Kind=orig?"supplemental":"original";
  if(orig&&!canSupplement(orig))return [];
  const saved=c.drafts.find(d=>d.ministry===ministry&&d.kind===kind&&d.state==="draft");
  if(saved)return saved.channel==="online_rehearsal"&&!saved.replace_batch?[saved]:[];
  const items:Proposal[]=kind==="original"?c.roster.filter(r=>r.ministry===ministry).map(r=>({assignment_id:r.id,proposal:"renew"})):[];
  return [{id:"UNSAVED-"+ministry,cycle_id:c.cycle??"",ministry,kind,channel:"online_rehearsal",revision:0,payload:makePayload(items),replace_batch:null,state:"draft"}];
 });
}
export function parishRosterStatus(c:Cycle,ministry:Ministry){
 const orig=c.batches.find(b=>b.ministry===ministry&&b.kind==="original");
 const supplements=c.batches.filter(b=>b.ministry===ministry&&b.kind==="supplemental");
 const drafts=c.drafts.filter(d=>d.ministry===ministry&&d.state==="draft");
 const advance=c.advances.find(a=>a.ministry===ministry&&!a.allocated_application);
 const returned=[orig,...supplements].some(b=>b?.status==="returned");
 const complete=!!orig&&(orig.financial_status==="renewed"||orig.status==="closed_no_charge");
 const label=orig?(orig.financial_status==="renewed"?"Submitted · "+orig.preferred_method+" settled":parishStatusLabel(orig)):drafts.length?(drafts.some(d=>d.channel==="walk_in")?"Walk-in draft":"Online draft"):"Not started";
 return {label,complete,attention:returned||!!advance||drafts.length>0,supplements:supplements.length,extra:drafts.some(d=>d.kind==="supplemental")?"Additional candidates in draft":null,advance,returned};
}
export function parishDraftReady(d:Draft,c:Cycle){
 const recommended=d.payload.items.some(i=>i.proposal!=="no");
 const eligible=editableRoster(c,d).filter(r=>r.ministry===d.ministry);
 return !!d.payload.roster_confirmed&&(d.kind==="supplemental"?recommended:eligible.every(r=>d.payload.items.some(i=>i.assignment_id===r.id)));
}

export function parishReadyDrafts(drafts:Draft[],cycle:Cycle){return drafts.filter(d=>parishDraftReady(d,cycle)&&isReady(d.payload,d.kind)&&!(d.kind==="original"&&d.payload.method!=="OTC"&&cycle.advances.some(a=>a.ministry===d.ministry&&!a.allocated_application)));}
export function parishPaymentGroups(c:Cycle){const grouped=new Map<string,Batch[]>();for(const b of c.batches){if(b.aggregate_id)grouped.set(b.aggregate_id,[...(grouped.get(b.aggregate_id)??[]),b]);}return Array.from(grouped.values());}
export function localSubmittedBatch(d:Draft,c:Cycle):Batch{
 const items=d.payload.items.map((i,j)=>{const r=c.roster.find(r=>r.id===i.assignment_id);return {...i,id:d.id+"-"+j,first_name:r?.first??i.first_name??"",last_name:r?.last??i.last_name??"",decision:i.proposal==="no"?"excluded" as const:"pending" as const};});
 return {id:d.id,cycle_id:d.cycle_id,reference:"LOCAL-"+d.id.slice(0,8).toUpperCase(),ministry:d.ministry,kind:d.kind,channel:d.channel,parent_id:d.kind==="supplemental"?c.batches.find(b=>b.ministry===d.ministry&&b.kind==="original")?.id??null:null,revision:1,status:"submitted",return_note:null,preferred_method:d.payload.method,letter_name:d.payload.letter,letter_reviewed:false,zero_declaration:d.payload.zero,aggregate_id:null,financial_status:null,due_centavos:null,paid_centavos:null,payment_reference:null,approved_count:0,batch_amount_centavos:0,qr_prepared:false,items};
}
