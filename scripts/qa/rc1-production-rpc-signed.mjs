// Genuine local GoTrue + PostgREST calls to EXACT deployed RC1 Registry RPC body.
// No user information or remote project credentials; all fixtures ephemeral.
// This test MUST fail if the backend permits an authorized duplicate bypass.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const lines=fs.readFileSync(process.env.RC1_LOCAL_ENV,'utf8').split(/\r?\n/);
const env=Object.fromEntries(lines.filter(s=>/^[A-Z_]+=/u.test(s)).map(s=>{
 const i=s.indexOf('=');return[s.slice(0,i),s.slice(i+1).replace(/^["']|["']$/g,'')];
}));
assert.match(env.API_URL||'',/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/);
assert.ok(env.ANON_KEY && env.DB_URL,'Missing disposable local Supabase credentials');
const db=new URL(env.DB_URL);
assert.ok(['localhost','127.0.0.1'].includes(db.hostname),'Do not connect to a remote database');
assert.equal(process.env.CI,'true','This must run in disposable CI');
function query(sql){
 const p=spawnSync('psql',['-X','-At','-v','ON_ERROR_STOP=1','-h',db.hostname,'-p',db.port||'5432',
 '-U',decodeURIComponent(db.username),'-d',db.pathname.replace(/^\//,''),'-c',sql],
 {encoding:'utf8',env:{...process.env,PGPASSWORD:decodeURIComponent(db.password)}});
 assert.equal(p.status,0,'Local SQL failed (no secret output)');
 return p.stdout.trim();
}
function state(){
 return JSON.parse(query("SELECT json_build_object('members',(SELECT count(*) FROM public.members),'assignments',(SELECT count(*) FROM public.member_ministries),'audit',(SELECT count(*) FROM public.audit_logs),'imports',(SELECT count(*) FROM public.import_batches),'duplicates',(SELECT count(*) FROM public.duplicate_flags))"));
}
async function api(path,method,body,token=env.ANON_KEY){
 const r=await fetch(env.API_URL+path,{method,headers:{apikey:env.ANON_KEY,authorization:'Bearer '+token,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 let data;try{data=await r.json()}catch{data=null}
 return {ok:r.ok,status:r.status,data};
}
async function user(kind){
 const email=kind+'@rc1-real-rpc-local.invalid';
 const password='local-RC1-only-Secure!74x';
 const signup=await api('/auth/v1/signup','POST',{email,password});
 assert.ok(signup.ok&&signup.data?.user?.id,'Synthetic local signup failed: '+kind);
 const login=await api('/auth/v1/token?grant_type=password','POST',{email,password});
 assert.ok(login.ok&&login.data?.access_token,'Synthetic local password login failed: '+kind);
 return {uid:signup.data.user.id,token:login.data.access_token};
}
const people={};
for(const kind of ['admin','ordinary','cowl','curia','revoked'])people[kind]=await user(kind);
const ids=[people.admin.uid,people.revoked.uid];
for(const id of ids){
 assert.match(id,/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i);
 query("INSERT INTO registry_private.registration_administrators(user_id,active,revoked_at) VALUES ('"+id+"',true,NULL)");
}
const RPC='/rest/v1/rpc/registry_admin_member_write_v1';
const ministryA='Ministry of Liturgical Music',ministryB='Ministry of Lectors and Commentators';
const member=(first_name,last_name,parish='Synthetic Parish A',ministries=[ministryA])=>({
 first_name,last_name,parish,service_year:2026,ministries
});
async function write(token,action,data){return api(RPC,'POST',{p_action:action,p_data:data},token)}
assert.deepEqual(state(),{members:0,assignments:0,audit:0,imports:0,duplicates:0});
for(const kind of ['ordinary','cowl','curia']){
 const before=state();
 const res=await write(people[kind].token,'create',member('Unauthorized','NoWrite'));
 assert.equal(res.ok,false,kind+' bypassed the exact protected write function');
 assert.deepEqual(state(),before,kind+' failed authorization mutated Registry');
}
const anon=await write(env.ANON_KEY,'create',member('Anon','NoWrite'));
assert.equal(anon.ok,false,'Anonymous caller bypassed exact protected RPC');
assert.deepEqual(state(),{members:0,assignments:0,audit:0,imports:0,duplicates:0});
console.log('PASS: REAL signed direct-RPC rejection for ordinary/COWL/Curia/anonymous users; zero changes.');

const first=await write(people.admin.token,'create',member('Synthetic','Minister','Synthetic Parish A',[ministryA,ministryB]));
assert.equal(first.status,200,'Genuine signed admin create denied: '+first.status);
assert.ok(first.data?.member?.id&&/^LMD-2026-/.test(first.data.member.uid),'Production UID trigger did not generate Registry ID');
assert.equal(first.data.member.status,'Pending Verification');
let x=state();
assert.equal(x.members,1);assert.equal(x.assignments,2);
assert.equal(x.audit,3,'Member + ministry audit triggers must append exactly three events');
console.log('PASS: EXACT Production Registry create RPC and real UID, assignment, and audit triggers committed atomically.');

const dup=await write(people.admin.token,'create',member('Synthetic','Minister','Synthetic Parish A',[ministryA,ministryB]));
assert.equal(dup.ok,false,'Exact duplicate was allowed despite real unique indexes');
assert.deepEqual(state(),x,'Failed duplicate must roll back member/assignment/audit records');
const invalid=await write(people.admin.token,'create',member('Invalid','Ministry','Synthetic Parish A',['Not an Approved Ministry']));
assert.equal(invalid.ok,false,'Invalid ministry accepted by real RPC');
assert.deepEqual(state(),x,'Invalid request mutated DB');
console.log('PASS: real unique-index duplicate and invalid ministry rejection, atomic no-write rollback.');

const batch=await write(people.admin.token,'create_batch',{rows:[
 member('Batch','Valid','Synthetic Parish B'),
 member('Batch','Invalid','Synthetic Parish B',['Not an Approved Ministry']),
 member('Batch','Valid2','Synthetic Parish C')
]});
assert.equal(batch.status,200,'Batch RPC failed');
assert.deepEqual(batch.data?.rows?.map(r=>r.status),['created','error','created'], 'Local-only batch row diagnostics: '+JSON.stringify((batch.data?.rows||[]).map(x=>({status:x.status,code:x.code,message:String(x.error||'').slice(0,180)}))));
x=state();assert.equal(x.members,3);assert.equal(x.assignments,4);assert.equal(x.audit,7);
console.log('PASS: exact RPC batch created two valid members, rolled back invalid row and logged only committed mutations.');

const hash='a'.repeat(64);
const begin=await write(people.admin.token,'import_begin',{file_hash:hash,file_name:'synthetic-local.csv',row_count:3,duplicates_routed:1});
assert.equal(begin.status,200);assert.ok(begin.data?.id);
const repeat=await write(people.admin.token,'import_begin',{file_hash:hash,file_name:'synthetic-local.csv',row_count:3,duplicates_routed:1});
assert.equal(repeat.status,200);
assert.equal(repeat.data?.already_imported,true,'Import idempotency must prevent second batch');
const finish=await write(people.admin.token,'import_finish',{batch_id:begin.data.id,unique_inserted:2});
assert.equal(finish.status,200);assert.equal(finish.data?.completed,true);
assert.equal(state().imports,1);
console.log('PASS: real transactional import-begin, idempotency and finish.');

const beforeRevoke=state();
query("UPDATE registry_private.registration_administrators SET active=false,revoked_at=now() WHERE user_id='"+people.revoked.uid+"'");
const rejected=await write(people.revoked.token,'create',member('Revoked','NoWrite'));
assert.equal(rejected.ok,false,'Revoked administrator can still write with same signed JWT');
assert.deepEqual(state(),beforeRevoke);
console.log('PASS: direct write RPC denies an administrator immediately after revocation with same JWT.');

const cross=await write(people.admin.token,'create',member('Synthetic','Minister','Synthetic Parish B',[ministryA,ministryB]));
// This is deliberately an ASSERTION, not a mocked pass. A cross-parish name
// collision bypassing the review queue is a release-blocking backend defect.
assert.equal(cross.ok,false,
 'RELEASE BLOCKER CONFIRMED: authorized direct Registry RPC created same-name/different-parish member without review; client-only duplicate interception is bypassable. The Production function must enforce review server-side.');
assert.deepEqual(state(),beforeRevoke,'Unsafe duplicate created despite rejection');
console.log('PASS: Production-equivalent direct-RPC duplicate enforcement');
