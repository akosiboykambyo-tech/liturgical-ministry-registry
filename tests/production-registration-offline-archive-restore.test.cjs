"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {readFileSync}=require("node:fs");
const {spawnSync}=require("node:child_process");
const path=require("node:path");
const target=path.join(__dirname,"../scripts/pr55-offline-archive-restore-rehearsal.sh");
const src=readFileSync(target,"utf8");
test("offline backup restore is explicitly opt-in, checksum verified and isolated",()=>{
  for(const expected of [
    "#!/usr/bin/env bash", "--network none", "--restart no", "--memory 1536m", "--cpus 2",
    "source=${backup},target=/input/archive.backup,readonly", "sha256sum --", '[[ "$actual" != "$expected" ]]',
    'volume="pr55_offline_restore_volume_', "--template=template0", "--exit-on-error --single-transaction --no-owner --no-acl",
    'rm --force "$container"', 'volume rm "$volume"', "trap cleanup EXIT",
    "public.members public.member_ministries auth.users storage.objects"
  ]) assert.ok(src.includes(expected),expected);
  for(const forbidden of ["--network host","--publish"," -p 5432","SERVICE_ROLE_KEY","SUPABASE_DB_URL","dropdb -d postgres","pg_restore -d postgres","--clean --if-exists"])
    assert.ok(!src.includes(forbidden),forbidden);
});
test("bash -n parses offline restore runner",()=>{
  const p=spawnSync("bash",["-n",target],{encoding:"utf8",timeout:10000});
  if(p.error?.code==="ENOENT")return;
  assert.equal(p.status,0,p.stderr);
});
