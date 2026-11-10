/**
 * Locally encrypt/verify a sensitive PR55 PostgreSQL logical backup.
 * AES-256-GCM + scrypt with a strong independent backup passphrase.
 * Runs entirely on the operator's PC. No database, network, or service calls.
 * Format v1: MAGIC | 16-byte salt | 12-byte nonce | 16-byte tag | ciphertext.
 * Entire file in memory; bounded to 512 MiB to avoid resource exhaustion.
 */
"use strict";
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const assert=require("node:assert/strict");
const {randomBytes,scryptSync,createCipheriv,createDecipheriv,createHash}=require("node:crypto");
const DIR=path.resolve(os.homedir(),"COWL-DOK-PRIVATE-BACKUPS");
const MAGIC=Buffer.from("COWLDOK-PG-AES256GCM-01","utf8");
const SALT_LENGTH=16;
const NONCE_LENGTH=12;
const TAG_LENGTH=16;
const OFFSET=MAGIC.length+SALT_LENGTH+NONCE_LENGTH+TAG_LENGTH;
const MAX_BYTES=512*1024*1024;
function sha(buffer){return createHash("sha256").update(buffer).digest("hex");}
function derive(passphrase,salt){
  return scryptSync(passphrase,salt,32,{N:32768,r:8,p:1,maxmem:64*1024*1024});
}
function encryptBytes(plain,passphrase){
  const salt=randomBytes(SALT_LENGTH),nonce=randomBytes(NONCE_LENGTH);
  const header=Buffer.concat([MAGIC,salt,nonce]);
  const key=derive(passphrase,salt);
  try{
    const cipher=createCipheriv("aes-256-gcm",key,nonce);
    cipher.setAAD(header);
    const ciphertext=Buffer.concat([cipher.update(plain),cipher.final()]);
    return Buffer.concat([header,cipher.getAuthTag(),ciphertext]);
  }finally{key.fill(0);}
}
function decryptBytes(blob,passphrase){
  if(blob.length<OFFSET||!blob.subarray(0,MAGIC.length).equals(MAGIC))
    throw new Error("unknown backup encryption format");
  const salt=blob.subarray(MAGIC.length,MAGIC.length+SALT_LENGTH);
  const nonce=blob.subarray(MAGIC.length+SALT_LENGTH,MAGIC.length+SALT_LENGTH+NONCE_LENGTH);
  const header=blob.subarray(0,MAGIC.length+SALT_LENGTH+NONCE_LENGTH);
  const tag=blob.subarray(header.length,OFFSET);
  const key=derive(passphrase,salt);
  try{
    const decipher=createDecipheriv("aes-256-gcm",key,nonce);
    decipher.setAAD(header);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(blob.subarray(OFFSET)),decipher.final()]);
  }finally{key.fill(0);}
}
if(process.argv.includes("--self-test")){
  const sample=Buffer.from("Synthetic offline PR55 backup: no real member records or credentials");
  const password="test-only-not-a-real-passphrase-19";
  const encrypted=encryptBytes(sample,password);
  assert.deepEqual(decryptBytes(encrypted,password),sample);
  encrypted[encrypted.length-1]^=1;
  assert.throws(()=>decryptBytes(encrypted,password));
  console.log("PASS: AES-256-GCM encryption, decryption and tamper rejection; synthetic data only, no files or network");
  process.exit(0);
}
const encrypt=process.argv.includes("--encrypt");
const verify=process.argv.includes("--verify");
if(Number(encrypt)+Number(verify)!==1){
  console.error("Usage: --self-test | --encrypt | --verify (private env vars required)");
  process.exit(2);
}
const selected=process.env.PR55_BACKUP_FILE||"";
const expected=(process.env.PR55_BACKUP_EXPECTED_SHA256||"").toLowerCase();
const passphrase=process.env.PR55_BACKUP_ENCRYPTION_PASSPHRASE||"";
delete process.env.PR55_BACKUP_ENCRYPTION_PASSPHRASE;
const file=path.resolve(selected||".");
const destination=file+".enc";
if(!/^cowl-dok-prod-\d{4}-\d\d-\d\dT[\w-]+\.backup$/.test(path.basename(file))||
   path.dirname(file).toLowerCase()!==DIR.toLowerCase()||
   !/^[a-f0-9]{64}$/.test(expected)||
   Array.from(passphrase).length<20){
  console.error("REFUSED: expected private production .backup path, 64-digit SHA256 and a 20+ character passphrase");
  process.exit(2);
}
try {
  if(encrypt) {
    const stat=fs.statSync(file);
    if(!stat.isFile()||stat.size<=0||stat.size>MAX_BYTES)
      throw new Error("backup missing, empty or exceeds 512 MiB safety limit");
    const plain=fs.readFileSync(file);
    if(sha(plain)!==expected)throw new Error("plaintext backup SHA256 does not match operator export result");
    const sealed=encryptBytes(plain,passphrase);
    let fd=null,created=false;
    try{
      fd=fs.openSync(destination,"wx",0o600);
      created=true;
      fs.writeFileSync(fd,sealed);
      fs.fsyncSync(fd);
      fs.closeSync(fd);fd=null;
      const check=decryptBytes(fs.readFileSync(destination),passphrase);
      if(sha(check)!==expected)throw new Error("encrypted backup verification mismatch");
    }catch(error){
      if(fd!==null){try{fs.closeSync(fd);}catch{}}
      if(created){try{fs.unlinkSync(destination);}catch{}}
      throw error;
    }
    console.log("PASS: local production backup encrypted AES-256-GCM and decrypted in memory for verification");
    console.log("ENCRYPTED FILE (keep private): "+destination);
    console.log("ENCRYPTED BYTES: "+fs.statSync(destination).size);
    console.log("ENCRYPTED SHA256: "+sha(fs.readFileSync(destination)));
    console.log("ORIGINAL SHA256 VERIFIED: "+expected);
    console.log("KEEP original .backup until encrypted off-site copy and isolated restore are proven");
  }else{
    if(!fs.existsSync(destination)||fs.statSync(destination).size>MAX_BYTES+OFFSET)
      throw new Error("encrypted backup missing or too large");
    const plain=decryptBytes(fs.readFileSync(destination),passphrase);
    if(sha(plain)!==expected)throw new Error("authenticated backup decrypted but original checksum mismatched");
    console.log("PASS: encrypted archive decrypts in memory and matches original SHA256; no plaintext file written");
    console.log("ORIGINAL SHA256 VERIFIED: "+expected);
  }
}catch{
  console.error("FAIL: local encryption or verification did not complete; check file, checksum, passphrase and disk space (details redacted)");
  process.exitCode=1;
}
