// Full local-only synthetic Auth credential + PRIVATE Storage bucket/object
// backup/restore rehearsal using real Supabase Auth and Storage APIs.
// No linked remote project, no real member identities or Storage bytes.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';

assert.equal(process.env.CI,'true');
const raw=fs.readFileSync(process.env.RC1_LOCAL_ENV,'utf8');
const vars=Object.fromEntries(raw.split(/\r?\n/).filter(x=>/^[A-Z_]+=/u.test(x)).map(x=>{
 const i=x.indexOf('=');return [x.slice(0,i),x.slice(i+1).replace(/^["']|["']$/g,'')];
}));
assert.match(vars.API_URL||'',/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/);
assert.ok(vars.SERVICE_ROLE_KEY&&vars.ANON_KEY&&vars.DB_URL,'Missing generated local Supabase status fields');
const db=new URL(vars.DB_URL);
assert.ok(['localhost','127.0.0.1'].includes(db.hostname),'No remote database permitted');
const opts={auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}};
const admin=createClient(vars.API_URL,vars.SERVICE_ROLE_KEY,opts);
function anon(){return createClient(vars.API_URL,vars.ANON_KEY,opts);}
function pg(command,args){
 const r=spawnSync(command,[...args,'-h',db.hostname,'-p',db.port||'5432','-U',decodeURIComponent(db.username),'-d',db.pathname.replace(/^\//,'')],{
  encoding:'utf8',env:{...process.env,PGPASSWORD:decodeURIComponent(db.password)}
 });
 assert.equal(r.status,0,command+' local synthetic Auth recovery operation failed (no SQL logs)');
}
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'rc1-local-recovery-'));
try {
 const email='recovery-synthetic@rc1-local-only.invalid';
 const password='rc1-Synthetic-Recovery-93!Z';
 const {data:signup,error:signupErr}=await anon().auth.signUp({email,password});
 assert.ifError(signupErr);
 assert.ok(signup.user?.id,'Local GoTrue synthetic signup unsuccessful');
 const uid=signup.user.id;
 assert.match(uid,/^[0-9a-f-]{36}$/i);
 const original=await anon().auth.signInWithPassword({email,password});
 assert.ifError(original.error);
 assert.equal(original.data.user.id,uid);

 const usersFile=path.join(directory,'synthetic_auth_users.sql');
 const identitiesFile=path.join(directory,'synthetic_auth_identities.sql');
 pg('pg_dump',['--data-only','--column-inserts','--no-owner','--no-privileges',
  '-t','auth.users','-f',usersFile]);
 pg('pg_dump',['--data-only','--column-inserts','--no-owner','--no-privileges',
  '-t','auth.identities','-f',identitiesFile]);
 assert.ok(fs.statSync(usersFile).size>0&&fs.statSync(identitiesFile).size>0);

 const deletion=await admin.auth.admin.deleteUser(uid);
 assert.ifError(deletion.error);
 const removed=await anon().auth.signInWithPassword({email,password});
 assert.ok(removed.error,'Deleted synthetic local GoTrue user unexpectedly signed in');

 // Restore actual hashed synthetic Auth user row and identity record from
 // SQL backup into the same clean, disposable Auth system.
 pg('psql',['-X','-v','ON_ERROR_STOP=1','-f',usersFile]);
 pg('psql',['-X','-v','ON_ERROR_STOP=1','-f',identitiesFile]);
 const restored=await anon().auth.signInWithPassword({email,password});
 assert.ifError(restored.error);
 assert.equal(restored.data.user.id,uid);
 console.log('PASS: synthetic Auth users + identities SQL backup, delete, restore and real GoTrue re-login.');

 const bucket='rc1-synthetic-recovery-private';
 const object='fixture/bytes.bin';
 const buffer=Buffer.from('RC1 synthetic PRIVATE Storage object bytes; restore integrity baseline 2026-11-23','utf8');
 const digest=x=>createHash('sha256').update(x).digest('hex');
 const baseline=digest(buffer);
 const created=await admin.storage.createBucket(bucket,{public:false});
 assert.ifError(created.error);
 const upload=await admin.storage.from(bucket).upload(object,buffer,{contentType:'application/octet-stream',upsert:false});
 assert.ifError(upload.error);
 const first=await admin.storage.from(bucket).download(object);
 assert.ifError(first.error);
 assert.equal(digest(Buffer.from(await first.data.arrayBuffer())),baseline);
 const scratch=path.join(directory,'synthetic_storage_bytes.bin');
 fs.writeFileSync(scratch,buffer,{mode:0o600});

 const removedObject=await admin.storage.from(bucket).remove([object]);
 assert.ifError(removedObject.error);
 const deleteBucket=await admin.storage.deleteBucket(bucket);
 assert.ifError(deleteBucket.error);
 const absent=await admin.storage.getBucket(bucket);
 assert.ok(absent.error,'Private bucket not deleted before restore');
 const reCreate=await admin.storage.createBucket(bucket,{public:false});
 assert.ifError(reCreate.error);
 const replacement=await admin.storage.from(bucket).upload(object,fs.readFileSync(scratch),{
  contentType:'application/octet-stream',upsert:false
 });
 assert.ifError(replacement.error);
 const recovered=await admin.storage.from(bucket).download(object);
 assert.ifError(recovered.error);
 assert.equal(digest(Buffer.from(await recovered.data.arrayBuffer())),baseline);
 const restoredBucket=await admin.storage.getBucket(bucket);
 assert.ifError(restoredBucket.error);
 assert.equal(restoredBucket.data.public,false,'Bucket lost private status during restore');
 const anonRead=await fetch(vars.API_URL+'/storage/v1/object/public/'+bucket+'/'+object);
 assert.equal(anonRead.ok,false,'Private restored Storage object accidentally public');
 console.log('PASS: synthetic private bucket/object delete and restore, byte-for-byte SHA-256 integrity and private access.');
 console.log('Scope: LOCAL synthetic Auth + Storage recovery only; NOT a restored encrypted Production archive.');
} finally {
 fs.rmSync(directory,{recursive:true,force:true});
}
