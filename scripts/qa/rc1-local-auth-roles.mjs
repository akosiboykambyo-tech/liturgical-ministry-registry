// RC1 synthetic-only local GoTrue/PostgREST signed-session guard test.
// Never connects to an existing Supabase project or prints generated keys.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const file = process.env.LOCAL_SUPABASE_ENV_FILE || (process.env.RUNNER_TEMP + '/rc1-local-supabase-status.env');
const raw = fs.readFileSync(file,'utf8');
const settings = Object.fromEntries(raw.split(/\r?\n/).filter(line=>/^[A-Z_]+=/u.test(line)).map(line=>{
 const n=line.indexOf('=');
 return [line.slice(0,n),line.slice(n+1).replace(/^["']|["']$/g,'')];
}));
assert.ok(settings.API_URL?.startsWith('http://127.0.0.1:') || settings.API_URL?.startsWith('http://localhost:'),'Only loopback API allowed');
assert.ok(settings.ANON_KEY,'Generated local anonymous key missing');
assert.ok(settings.DB_URL?.startsWith('postgresql://') || settings.DB_URL?.startsWith('postgres://'),'Generated local DB URL missing');
const db = new URL(settings.DB_URL);
assert.ok(['127.0.0.1','localhost'].includes(db.hostname),'Only loopback database allowed');

function sql(query) {
 const result = spawnSync('psql',[
  '-X','-v','ON_ERROR_STOP=1','-h',db.hostname,'-p',db.port||'5432',
  '-U',decodeURIComponent(db.username),'-d',db.pathname.replace(/^\//,''),'-c',query
 ],{env:{...process.env,PGPASSWORD:decodeURIComponent(db.password)},encoding:'utf8'});
 assert.equal(result.status,0,'Local-only synthetic SQL failed');
}
async function request(path, method, body, bearer=settings.ANON_KEY) {
 const response = await fetch(settings.API_URL+path,{
  method,
  headers:{apikey:settings.ANON_KEY,authorization:'Bearer '+bearer,'content-type':'application/json'},
  body:body===undefined?undefined:JSON.stringify(body)
 });
 let payload;
 try { payload=await response.json(); } catch { payload={}; }
 return {status:response.status,ok:response.ok,data:payload};
}
const password='RC1-Only-Local-1!zR7fp';
const users=[];
for(const role of ['admin','ordinary','revoked','cowl','curia']){
 const email=role+'@rc1-local-only.invalid';
 const signup=await request('/auth/v1/signup','POST',{email,password});
 assert.ok(signup.ok && signup.data.user?.id,role+' signup status '+signup.status);
 const uid=signup.data.user.id;
 assert.match(uid,/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
 const login=await request('/auth/v1/token?grant_type=password','POST',{email,password});
 assert.ok(login.ok && login.data.access_token,role+' sign-in status '+login.status);
 users.push({role,uid,token:login.data.access_token});
}
const admin=users.find(u=>u.role==='admin');
const revoked=users.find(u=>u.role==='revoked');
sql("INSERT INTO registry_private.registration_administrators(user_id,active,revoked_at) VALUES ('"+admin.uid+"',true,NULL),('"+revoked.uid+"',true,NULL)");
async function isAdmin(user) {
 let res;
 for(let attempt=0;attempt<5;attempt++){
  res=await request('/rest/v1/rpc/registration_is_admin','POST',{},user.token);
  if(res.status!==404) break;
  await new Promise(resolve=>setTimeout(resolve,500));
 }
 assert.equal(res.status,200,user.role+' signed RPC status '+res.status);
 assert.equal(typeof res.data,'boolean',user.role+' RPC returned nonboolean');
 return res.data;
}
assert.equal(await isAdmin(admin),true,'Active Registry admin denied');
for(const user of users.filter(u=>['ordinary','cowl','curia'].includes(u.role))){
 assert.equal(await isAdmin(user),false,'Unauthorised Registry role passed: '+user.role);
}
assert.equal(await isAdmin(revoked),true,'Pre-revocation signed administrator denied');
sql("UPDATE registry_private.registration_administrators SET active=false,revoked_at=now() WHERE user_id='"+revoked.uid+"'");
assert.equal(await isAdmin(revoked),false,'Same signed token remained authorized after revocation');
const anonymous=await request('/rest/v1/rpc/registration_is_admin','POST',{},settings.ANON_KEY);
assert.ok(!anonymous.ok && anonymous.status>=400 && anonymous.status<500,'Anonymous RPC unexpectedly accepted');
console.log('PASS: 5 genuine local GoTrue password sessions; active, ordinary, revoked, COWL, Curia and anonymous registry guard results.');
console.log('Only synthetic local fixtures; not the full Production schema or real Registry write RPC.');
