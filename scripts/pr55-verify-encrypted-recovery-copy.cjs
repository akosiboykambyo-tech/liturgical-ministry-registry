/**
 * Offline, read-only authenticated recovery proof of the SECOND encrypted DB + Storage ZIP copies on D:.
 * No plaintext output, uploads, production connections, DB writes or network.
 */
"use strict";
const fs=require("node:fs"),path=require("node:path"),os=require("node:os"),assert=require("node:assert/strict");
const {createHash,createCipheriv,createDecipheriv,scryptSync,randomBytes}=require("node:crypto");
const dbMagic=Buffer.from("COWLDOK-PG-AES256GCM-01");
const stMagic=Buffer.from("COWLDOK-STORAGE-AES256GCM-01");
const EXPECTED_DB_SHA="739c9e239534bd496c7dfe2cdbca787f2caa70ad68319fbc1694d15cd383b943";
const EXPECTED_ZIP_SHA="eabc5230be8de995550f9af41ea92723a8285593fcf30456eaa3db76ab296077";
const EXPECTED_STORAGE_ENC_SHA="539e4b71c3bcf0a1cbc0c7c9c1f19d41186c8ddfad5f7c34be308dd8873d90a0";
const DB_NAME="cowl-dok-prod-2026-10-30T00-55-47-217Z-44da52.backup.enc";
const ZIP_NAME=/^cowl-dok-storage-prod-\d{8}-\d{6}\.zip\.enc$/;
function hash(b){return createHash("sha256").update(b).digest("hex");}
function keyFor(p,s){return scryptSync(p,s,32,{N:32768,r:8,p:1,maxmem:64*1024*1024});}
function dbDecrypt(blob,pass){
  const hlen=dbMagic.length+16+12;
  if(blob.length<hlen+16||!blob.subarray(0,dbMagic.length).equals(dbMagic))throw Error("invalid database encrypted format");
  const hdr=blob.subarray(0,hlen),salt=blob.subarray(dbMagic.length,dbMagic.length+16);
  const nonce=blob.subarray(dbMagic.length+16,hlen),tag=blob.subarray(hlen,hlen+16);
  const key=keyFor(pass,salt);
  try{
    const dec=createDecipheriv("aes-256-gcm",key,nonce);
    dec.setAAD(hdr);dec.setAuthTag(tag);
    return Buffer.concat([dec.update(blob.subarray(hlen+16)),dec.final()]);
  }finally{key.fill(0);}
}
function storageDecrypt(blob,pass){
  const hlen=stMagic.length+16+12;
  if(blob.length<hlen+17||!blob.subarray(0,stMagic.length).equals(stMagic))throw Error("invalid Storage encrypted format");
  const hdr=blob.subarray(0,hlen),salt=blob.subarray(stMagic.length,stMagic.length+16);
  const nonce=blob.subarray(stMagic.length+16,hlen),tag=blob.subarray(blob.length-16);
  const key=keyFor(pass,salt);
  try{
    const dec=createDecipheriv("aes-256-gcm",key,nonce);
    dec.setAAD(hdr);dec.setAuthTag(tag);
    return Buffer.concat([dec.update(blob.subarray(hlen,blob.length-16)),dec.final()]);
  }finally{key.fill(0);}
}
function safeRead(file,max){
  const st=fs.lstatSync(file);
  if(!st.isFile()||st.size<128||st.size>max)throw Error("unexpected encrypted file");
  return fs.readFileSync(file);
}
function assertChild(parent,child){
  const rel=path.relative(parent,child);
  if(!rel||rel.startsWith("..")||path.isAbsolute(rel))throw Error("private backup path must be under expected root");
}
function selfTest(){
  const pass="synthetic-only-test-passphrase-2026",salt=randomBytes(16),nonce=randomBytes(12),key=keyFor(pass,salt);
  const plain=Buffer.from("Synthetic data only, no member records");
  try{
    for(const variant of ["db","storage"]){
      const magic=variant==="db"?dbMagic:stMagic,hdr=Buffer.concat([magic,salt,nonce]);
      const c=createCipheriv("aes-256-gcm",key,nonce);c.setAAD(hdr);
      const body=Buffer.concat([c.update(plain),c.final()]),tag=c.getAuthTag();
      const blob=variant==="db"?Buffer.concat([hdr,tag,body]):Buffer.concat([hdr,body,tag]);
      const dec=variant==="db"?dbDecrypt:storageDecrypt;
      assert.deepEqual(dec(blob,pass),plain);
      const corrupt=Buffer.from(blob);corrupt[corrupt.length-1]^=1;
      assert.throws(()=>dec(corrupt,pass));assert.throws(()=>dec(blob,"wrong-test-passphrase"));
    }
  }finally{key.fill(0);}
  console.log("PASS: synthetic encrypted-copy decryption and tamper-rejection tests; no private files");
}
function main(){
  if(process.argv.includes("--self-test")){selfTest();return;}
  if(process.argv.length!==2||process.platform!=="win32")throw Error("Windows-only offline read-only proof");
  const dbPass=process.env.PR55_RECOVERY_DB_PASSPHRASE||"",zipPass=process.env.PR55_RECOVERY_STORAGE_PASSPHRASE||"";
  const dir=path.resolve(process.env.PR55_RECOVERY_COPY_DIR||".");
  delete process.env.PR55_RECOVERY_DB_PASSPHRASE;delete process.env.PR55_RECOVERY_STORAGE_PASSPHRASE;
  if(Array.from(dbPass).length<20||Array.from(zipPass).length<20)throw Error("required passphrase missing");
  const root=path.resolve("D:\\COWL-DOK-PRIVATE-BACKUPS");
  assertChild(root,dir);
  if(!/^protected-set-\d{8}-\d{6}$/.test(path.basename(dir)))throw Error("unexpected protected-copy folder");
  const files=fs.readdirSync(dir),zips=files.filter(f=>ZIP_NAME.test(f));
  if(zips.length!==1||!files.includes(DB_NAME)||files.length!==2)throw Error("unexpected private copy inventory");
  const src=path.resolve(os.homedir(),"COWL-DOK-PRIVATE-BACKUPS");
  const dbCopy=safeRead(path.join(dir,DB_NAME),512*1024*1024);
  const zipCopy=safeRead(path.join(dir,zips[0]),2*1024*1024*1024);
  if(hash(dbCopy)!==hash(safeRead(path.join(src,DB_NAME),512*1024*1024)))throw Error("DB ciphertext mismatch");
  if(hash(zipCopy)!==EXPECTED_STORAGE_ENC_SHA||hash(zipCopy)!==hash(safeRead(path.join(src,zips[0]),2*1024*1024*1024)))throw Error("Storage ciphertext mismatch");
  console.log("PASS: second-copy encrypted archives match original ciphertext SHA256");
  const dbPlain=dbDecrypt(dbCopy,dbPass);
  try{
    if(hash(dbPlain)!==EXPECTED_DB_SHA)throw Error("DB recovered archive checksum mismatch");
    console.log("PASS: encrypted DB copy on D: recovered and matches original SHA256");
  }finally{dbPlain.fill(0);}
  const zipPlain=storageDecrypt(zipCopy,zipPass);
  try{
    if(hash(zipPlain)!==EXPECTED_ZIP_SHA||!zipPlain.subarray(0,4).equals(Buffer.from([0x50,0x4b,0x03,0x04])))throw Error("Storage ZIP recovery mismatch");
    console.log("PASS: encrypted Storage copy on D: recovered and matches verified ZIP SHA256");
  }finally{zipPlain.fill(0);}
  console.log("LIMIT: no full Auth service, roles/ACL or private Storage-service restore was performed");
  console.log("LIMIT: D: is on the same PC; an independent off-device copy is still required");
}
if(require.main===module){try{main();}catch{console.error("NO-GO: offline encrypted-copy recovery proof failed (details redacted)");process.exitCode=1;}}
module.exports={dbDecrypt,storageDecrypt,selfTest};
