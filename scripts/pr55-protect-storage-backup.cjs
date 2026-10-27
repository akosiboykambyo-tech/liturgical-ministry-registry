/**
 * Offline streaming encryption of a COWL-DOK Storage ZIP backup.
 * Format: UTF-8 MAGIC | 16-byte salt | 12-byte nonce | ciphertext | 16-byte GCM tag.
 * Does not read member documents into process memory, upload data, or touch production.
 */
"use strict";
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const assert=require("node:assert/strict");
const {createHash,randomBytes,scryptSync,createCipheriv,createDecipheriv}=require("node:crypto");
const MAGIC=Buffer.from("COWLDOK-STORAGE-AES256GCM-01","utf8");
const SALT=16, NONCE=12, TAG=16, HEADER=MAGIC.length+SALT+NONCE;
const root=path.resolve(os.homedir(),"COWL-DOK-PRIVATE-BACKUPS");
const MAX=2*1024*1024*1024;
function keyFor(pass,salt){return scryptSync(pass,salt,32,{N:32768,r:8,p:1,maxmem:64*1024*1024});}
function hash(b){return createHash("sha256").update(b).digest("hex");}
function writeAll(fd,buf){
  let off=0;
  while(off<buf.length){
    const n=fs.writeSync(fd,buf,off,buf.length-off);
    if(n<=0)throw Error("short file write");
    off+=n;
  }
}
async function fileSha(name){
  const h=createHash("sha256");
  for await(const b of fs.createReadStream(name,{highWaterMark:1024*1024}))h.update(b);
  return h.digest("hex");
}
async function seal(name,destination,expected,pass){
  const stat=fs.statSync(name);
  if(!stat.isFile()||stat.size<1||stat.size>MAX)throw Error("source archive missing, empty or excessive");
  if((await fileSha(name))!==expected)throw Error("source ZIP SHA-256 mismatch");
  const salt=randomBytes(SALT),nonce=randomBytes(NONCE);
  const hdr=Buffer.concat([MAGIC,salt,nonce]);
  const key=keyFor(pass,salt);
  let fd=null,created=false;
  try{
    fd=fs.openSync(destination,"wx",0o600);
    created=true;
    writeAll(fd,hdr);
    const cipher=createCipheriv("aes-256-gcm",key,nonce);
    cipher.setAAD(hdr);
    for await (const chunk of fs.createReadStream(name,{highWaterMark:1024*1024})){
      writeAll(fd,cipher.update(chunk));
    }
    writeAll(fd,cipher.final());
    writeAll(fd,cipher.getAuthTag());
    fs.fsyncSync(fd);
    fs.closeSync(fd);fd=null;
    // Independently verify on disk: no plaintext copy is written.
    await verify(destination,expected,pass);
    console.log("PASS: Storage ZIP encrypted and decrypted in memory for authenticated verification");
    console.log("ENCRYPTED BYTES: "+fs.statSync(destination).size);
    console.log("ENCRYPTED SHA256: "+await fileSha(destination));
    console.log("SOURCE ZIP SHA256 VERIFIED: "+expected);
    console.log("KEEP original ZIP and Storage folder until isolated restore is proven");
  }catch(e){
    if(fd!==null){try{fs.closeSync(fd);}catch{}}
    if(created){try{fs.unlinkSync(destination);}catch{}}
    throw e;
  }finally{key.fill(0);}
}
async function verify(destination,expected,pass){
  const stat=fs.statSync(destination);
  if(!stat.isFile()||stat.size<HEADER+TAG+1||stat.size>MAX+HEADER+TAG)throw Error("encrypted file absent or unexpected length");
  const fd=fs.openSync(destination,"r");
  let hdr,tag;
  try{
    hdr=Buffer.alloc(HEADER);
    tag=Buffer.alloc(TAG);
    if(fs.readSync(fd,hdr,0,HEADER,0)!==HEADER||fs.readSync(fd,tag,0,TAG,stat.size-TAG)!==TAG)
      throw Error("encrypted header truncated");
  }finally{fs.closeSync(fd);}
  if(!hdr.subarray(0,MAGIC.length).equals(MAGIC))throw Error("unknown encrypted archive format");
  const salt=hdr.subarray(MAGIC.length,MAGIC.length+SALT);
  const nonce=hdr.subarray(MAGIC.length+SALT,HEADER);
  const key=keyFor(pass,salt);
  try{
    const dec=createDecipheriv("aes-256-gcm",key,nonce);
    dec.setAAD(hdr);
    dec.setAuthTag(tag);
    const hasher=createHash("sha256");
    for await(const chunk of fs.createReadStream(destination,{
      start:HEADER,end:stat.size-TAG-1,highWaterMark:1024*1024
    })){
      hasher.update(dec.update(chunk));
    }
    hasher.update(dec.final()); // rejects wrong passphrase/tampered ciphertext
    if(hasher.digest("hex")!==expected)throw Error("decrypted ZIP SHA-256 mismatch");
    return true;
  }finally{key.fill(0);}
}
function selfTest(){
  const pass="offline-only-test-strong-passphrase";
  const original=Buffer.from("Synthetic COWL-DOK Storage data; no actual files");
  const salt=randomBytes(SALT),nonce=randomBytes(NONCE),hdr=Buffer.concat([MAGIC,salt,nonce]);
  const key=keyFor(pass,salt);
  try{
    const cipher=createCipheriv("aes-256-gcm",key,nonce);
    cipher.setAAD(hdr);
    const c=Buffer.concat([cipher.update(original),cipher.final()]);
    const tag=cipher.getAuthTag();
    const dec=createDecipheriv("aes-256-gcm",key,nonce);
    dec.setAAD(hdr);dec.setAuthTag(tag);
    assert.deepEqual(Buffer.concat([dec.update(c),dec.final()]),original);
    c[0]^=1;
    const tampered=createDecipheriv("aes-256-gcm",key,nonce);
    tampered.setAAD(hdr);tampered.setAuthTag(tag);
    assert.throws(()=>{tampered.update(c);tampered.final();});
    console.log("PASS: Storage encryption synthetic self-test and tamper rejection; no source files or network");
  }finally{key.fill(0);}
}
async function main(){
  if(process.argv.includes("--self-test")){selfTest();return;}
  const encrypt=process.argv.includes("--encrypt"),check=process.argv.includes("--verify");
  if(Number(encrypt)+Number(check)!==1)throw Error("use --encrypt, --verify or --self-test");
  const name=path.resolve(process.env.PR55_STORAGE_ZIP||".");
  const expected=(process.env.PR55_STORAGE_ZIP_SHA256||"").toLowerCase();
  const pass=process.env.PR55_STORAGE_PASSPHRASE||"";
  delete process.env.PR55_STORAGE_PASSPHRASE;
  if(path.dirname(name).toLowerCase()!==root.toLowerCase()||
    !/^cowl-dok-storage-prod-\d{8}-\d{6}\.zip$/.test(path.basename(name))||
    !/^[a-f0-9]{64}$/.test(expected)||Array.from(pass).length<20)
    throw Error("invalid private archive path, SHA-256 or passphrase requirement");
  if(encrypt)await seal(name,name+".enc",expected,pass);
  else{
    await verify(name+".enc",expected,pass);
    console.log("PASS: Storage encrypted ZIP independently authenticated and original SHA256 verified; no plaintext written");
    console.log("SOURCE ZIP SHA256 VERIFIED: "+expected);
  }
}
main().catch(()=>{
  console.error("FAIL: offline Storage encryption or verification failed; check source, hash, passphrase and disk space (details redacted)");
  process.exitCode=1;
});
