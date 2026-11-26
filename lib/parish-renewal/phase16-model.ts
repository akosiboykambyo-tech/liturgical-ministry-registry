import {MINISTRIES,type Ministry} from "@/lib/constants";
import type {Decision,RosterRow} from "./phase16-reconciliation";
export type Row=RosterRow&{parish?:string;renewal_date?:string|null;expiration_date?:string|null};
export type Request={kind:"new_member"|"ministry_assignment"|"identity_review";first:string;last:string;candidateId?:string;source:"manual"|"csv"};
export type Section={ministry:Ministry;confirmed:boolean;items:{id:string;decision:Decision}[];requests:Request[];letter:{name:string;confirmed:boolean}|null;zeroDeclaration:boolean};
export type ReviewItem={id:string;ministry:Ministry;assignment_id:string|null;first_name:string;last_name:string;proposal:string;proposed_first:string|null;proposed_last:string|null;decision:"pending"|"approved"|"rejected"|"excluded";review_note:string|null};
export type ReviewLetter={ministry:Ministry;filename:string|null;received:string|null;retain_until:string|null;reviewed:boolean};
export type Submission={id:string;reference:string;parish:string;service_year:number;channel:"online_rehearsal"|"walk_in";revision:number;status:"draft"|"submitted"|"returned"|"reviewed"|"closed_no_charge";payload:Section[];return_ministry:Ministry|null;return_note:string|null;aggregate_id:string|null;financial_status:string|null;due_centavos:number|null;paid_centavos:number|null;payment_reference:string|null;qr_prepared:boolean;letters:ReviewLetter[];items:ReviewItem[];breakdown:{ministry:Ministry;count:number}[]};
export type Snapshot={roles:{admin:boolean;finance:boolean};roster:Row[];submissions:Submission[]};
export function makeSections(roster:readonly Row[]):Section[]{return MINISTRIES.map(ministry=>({ministry,confirmed:false,items:roster.filter(r=>r.ministry===ministry).map(r=>({id:r.id,decision:"renew"})),requests:[],letter:null,zeroDeclaration:false}));}
export function needsLetter(s:Section){return s.items.some(i=>i.decision!=="no")||s.requests.length>0;}
export function sectionCompliant(s:Section){return s.confirmed&&(needsLetter(s)?Boolean(s.letter?.name&&s.letter.confirmed):s.zeroDeclaration);}
export function estimateCount(s:Section){return s.items.filter(i=>i.decision==="renew").length+s.requests.filter(r=>r.kind!=="identity_review"&&!r.candidateId).length;}
export const money=(centavos:number)=>new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP"}).format(centavos/100);
export const statusNames:Record<string,string>={draft:"Draft",submitted:"For review",returned:"Correction requested",reviewed:"Registry review completed",closed_no_charge:"Closed — no approved assignments",documents_approved:"Awaiting finance authorization",awaiting_payment:"Awaiting full payment",renewed:"Renewed"};
export function fictionalRoster(parish:string):Row[]{return MINISTRIES.flatMap((ministry,i)=>[["Maria","Santos"],["Jose","Reyes"],["Teresa","Cruz"],["Rafael","Garcia"]].map(([first,last],j)=>({id:"LOCAL-"+parish+"-"+i+"-"+j,first,last,ministry,parish}))); }
