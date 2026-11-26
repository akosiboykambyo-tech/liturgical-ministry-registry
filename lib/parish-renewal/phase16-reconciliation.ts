/** Phase 1.6 parish reconciliation. Pure draft logic; never establishes identity, grants access,
 * creates a member, writes a registry record, or authorizes a charge. Caller must provide a
 * parish-scoped roster from trusted authorization; production must revalidate server-side. */
import {MINISTRIES,shortMinistry,type Ministry} from "../constants";
import {areNamesSimilar} from "../registration-matching";
export {MINISTRIES};
export type RosterRow={id:string;first:string;last:string;ministry:Ministry};
export type Incoming={row:number;first:string;last:string;ministry:Ministry};
export type MatchKind="exact"|"similar"|"ambiguous"|"other_ministry"|"unmatched"|"duplicate";
export type Match={incoming:Incoming;kind:MatchKind;candidates:RosterRow[]};
export type Choice={kind:"match";id:string}|{kind:"request_match";id:string}|{kind:"request_new"}|{kind:"exclude"};
export type Decision="renew"|"no"|"hold";
export const CSV_HEADER="First Name,Last Name,Ministry";
const norm=(v:string)=>v.normalize("NFC").trim().replace(/\s+/g," ").toLowerCase();
const nameKey=(r:{first:string;last:string})=>JSON.stringify([norm(r.first),norm(r.last)]);
const assignmentKey=(r:{first:string;last:string;ministry:Ministry})=>JSON.stringify([nameKey(r),r.ministry]);
const validName=(s:string)=>s.length>0&&s.length<=100&&!/^[=+@-]/.test(s.trim())&&!/[\u0000-\u001f\u007f]/.test(s);
function ministryFor(s:string):Ministry|undefined{return MINISTRIES.find(m=>norm(m)===norm(s)||norm(shortMinistry(m))===norm(s));}
function parseRows(text:string):string[][]{
 const input=text.replace(/^\uFEFF/,"");
 if(new TextEncoder().encode(input).byteLength>1024*1024)throw Error("CSV exceeds 1 MB.");
 const rows:string[][]=[];let row:string[]=[],field="",quoted=false,closed=false;
 const cell=()=>{row.push(field);field="";closed=false;};
 const line=()=>{cell();if(row.some(v=>v.trim())||row.length>1)rows.push(row);row=[];if(rows.length>3001)throw Error("Maximum 3,000 data rows.");};
 for(let i=0;i<input.length;i++){const c=input[i];
  if(quoted){if(c==='"'&&input[i+1]==='"'){field+='"';i++;}else if(c==='"'){quoted=false;closed=true;}else field+=c;continue;}
  if(c==='"'){if(field||closed)throw Error("Unexpected quote in CSV.");quoted=true;}
  else if(c===",")cell();
  else if(c==="\r"||c==="\n"){if(c==="\r"&&input[i+1]==="\n")i++;line();}
  else{if(closed)throw Error("Unexpected text after quoted field.");field+=c;}
 }
 if(quoted)throw Error("Unclosed quoted field.");if(field||row.length||closed)line();return rows;
}
export function parseRenewalCSV(text:string):Incoming[]{
 const rows=parseRows(text);if(!rows.length)throw Error("Empty CSV.");
 const header=rows.shift()!.map(norm),required=["first name","last name","ministry"],idx=required.map(v=>header.indexOf(v));
 if(header.length!==3||new Set(header).size!==3||idx.some(i=>i<0))throw Error("Use exactly First Name, Last Name, Ministry.");
 if(!rows.length)throw Error("No names found. Use manual review for an intentionally empty ministry.");
 return rows.map((r,i)=>{const first=r[idx[0]]?.trim()??"",last=r[idx[1]]?.trim()??"",ministry=ministryFor(r[idx[2]]??"");
  if(r.length!==3||!validName(first)||!validName(last)||!ministry)throw Error("CSV row "+(i+2)+": invalid name, ministry or column count.");
  return {row:i+2,first,last,ministry};});
}
export function exportRenewalCSV(rows:readonly RosterRow[]):string{
 const q=(s:string)=>'"'+s.replace(/"/g,'""')+'"';
 if(rows.some(r=>!validName(r.first)||!validName(r.last)||!MINISTRIES.includes(r.ministry)))throw Error("Unsafe roster value; export requires review.");
 return CSV_HEADER+"\r\n"+rows.map(r=>[r.first,r.last,r.ministry].map(q).join(",")).join("\r\n")+(rows.length?"\r\n":"");
}
function validateRoster(roster:readonly RosterRow[]){
 if(roster.some(r=>!r.id||!validName(r.first)||!validName(r.last)||!MINISTRIES.includes(r.ministry))||new Set(roster.map(r=>r.id)).size!==roster.length)throw Error("Invalid or duplicate roster assignment.");
}
export function matchRenewalRows(rows:readonly Incoming[],roster:readonly RosterRow[]):Match[]{
 validateRoster(roster);const seen=new Set<string>();
 return rows.map(incoming=>{
  const key=assignmentKey(incoming);if(seen.has(key))return {incoming,kind:"duplicate",candidates:[]};seen.add(key);
  const exact=roster.filter(r=>nameKey(r)===nameKey(incoming)),same=exact.filter(r=>r.ministry===incoming.ministry);
  if(same.length===1)return {incoming,kind:"exact",candidates:same};
  if(same.length>1)return {incoming,kind:"ambiguous",candidates:same};
  if(exact.length)return {incoming,kind:"other_ministry",candidates:exact};
  const similar=roster.filter(r=>r.ministry===incoming.ministry&&areNamesSimilar(r.first,incoming.first)&&areNamesSimilar(r.last,incoming.last));
  return {incoming,kind:similar.length>1?"ambiguous":similar.length?"similar":"unmatched",candidates:similar};
 });
}
export function reconcileRenewal(input:{rows:readonly Incoming[];roster:readonly RosterRow[];scope:readonly Ministry[];choices:Readonly<Record<number,Choice>>;omissions:Readonly<Record<string,Decision>>;confirmed:boolean}){
 const {rows,roster,scope,choices,omissions,confirmed}=input;validateRoster(roster);
 if(!confirmed)throw Error("Confirm the complete renewal list and omissions.");
 const ministries=new Set(scope);if(!scope.length||scope.some(m=>!MINISTRIES.includes(m))||rows.some(r=>!ministries.has(r.ministry)))throw Error("Invalid ministry scope.");
 if(new Set(rows.map(r=>r.row)).size!==rows.length)throw Error("Duplicate source row identifiers.");
 const matches=matchRenewalRows(rows,roster),linked=new Set<string>(),proposedNames=new Set<string>();
 const decisions:Record<string,Decision>={};const requests:{row:Incoming;kind:"new_member"|"ministry_assignment"|"identity_review";candidateIds:string[]}[]=[];
 for(const m of matches){const c=choices[m.incoming.row];if(!c)throw Error("Resolve CSV row "+m.incoming.row+".");
  if(c.kind==="exclude")continue;
  if(m.kind==="duplicate")throw Error("Repeated rows must be excluded.");
  if(c.kind==="match"||c.kind==="request_match"){
   const candidate=m.candidates.find(r=>r.id===c.id&&r.ministry===m.incoming.ministry);
   if(!candidate||linked.has(candidate.id))throw Error("Invalid or repeated assignment link.");
   if(c.kind==="match"&&m.kind!=="exact")throw Error("Non-exact identity requires COWL review.");
   linked.add(candidate.id);decisions[candidate.id]=c.kind==="match"?"renew":"hold";
   if(c.kind==="request_match")requests.push({row:m.incoming,kind:"identity_review",candidateIds:[candidate.id]});
  }else if(c.kind==="request_new"){
   if(m.kind==="exact")throw Error("Existing exact assignment cannot be proposed as new.");
   const key=assignmentKey(m.incoming);if(proposedNames.has(key))throw Error("Duplicate proposed assignment.");proposedNames.add(key);
   requests.push({row:m.incoming,kind:m.kind==="other_ministry"?"ministry_assignment":m.kind==="ambiguous"||m.kind==="similar"?"identity_review":"new_member",candidateIds:m.candidates.map(r=>r.id)});
  }else throw Error("Unknown reconciliation choice.");
 }
 for(const r of roster){if(!ministries.has(r.ministry)||linked.has(r.id))continue;const d=omissions[r.id];if(d!=="renew"&&d!=="no"&&d!=="hold")throw Error("Explicit omission decision required for "+r.id+".");decisions[r.id]=d;}
 return {decisions,requests,reviewedMinistries:scope.filter(m=>!roster.some(r=>r.ministry===m&&decisions[r.id]==="hold")&&!requests.some(r=>r.row.ministry===m&&r.kind==="identity_review"))};
}
/** Exact integer-centavo arithmetic, never an authorization or an approved rate. */
export function estimateRenewal(rows:readonly {ministry:Ministry;count:number;rateCentavos:number}[]){
 const seen=new Set<Ministry>();let total=0;
 const items=rows.map(r=>{if(!MINISTRIES.includes(r.ministry)||seen.has(r.ministry)||!Number.isSafeInteger(r.count)||r.count<0||!Number.isSafeInteger(r.rateCentavos)||r.rateCentavos<0)throw Error("Invalid estimate row.");seen.add(r.ministry);
 const amountCentavos=r.count*r.rateCentavos;if(!Number.isSafeInteger(amountCentavos)||!Number.isSafeInteger(total+amountCentavos))throw Error("Estimate overflow.");total+=amountCentavos;return {...r,amountCentavos};});
 return {items,totalCentavos:total};
}
