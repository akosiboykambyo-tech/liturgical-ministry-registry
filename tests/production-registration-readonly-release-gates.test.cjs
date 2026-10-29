"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const sql=fs.readFileSync(path.join(__dirname,"../docs/sql/pr55-production-release-gates.READONLY.sql"),"utf8");
const notes=fs.readFileSync(path.join(__dirname,"../docs/pr55-production-release-gates-2026-10-29.md"),"utf8");
test("production gate query is read-only, aggregate and does not leak credentials or identities",()=>{
 assert.match(sql,/SELECT 'production-identity'/);
 assert.match(sql,/SELECT 'storage-recovery'/);
 assert.match(sql,/SELECT 'future-dated-renewal'/);
 assert.match(sql,/SELECT 'ministry-letter-evidence'/);
 assert.match(sql,/auth_users|Auth users/);
 assert.match(sql,/registry_private\.registration_administrators/);
 assert.match(sql,/to_regprocedure\('public\.registry_verify_ministries_v1/);
 assert.match(sql,/has_table_privilege\('authenticated','public\.member_ministries','UPDATE'\)/);
 assert.doesNotMatch(sql,/\b(INSERT INTO|UPDATE public\.|DELETE FROM|DROP TABLE|CREATE TABLE|ALTER TABLE|GRANT EXECUTE|REVOKE EXECUTE|TRUNCATE TABLE)\b/i);
 assert.doesNotMatch(sql,/SELECT.*(email|encrypted_password|document_url)/i);
});
test("report does not assume free plan offers a complete managed restore or grant administrator silently",()=>{
 assert.match(notes,/Free plan/);
 assert.match(notes,/paid plan \+ physical backups/);
 assert.match(notes,/does not copy Storage objects/);
 assert.match(notes,/2027-09-18/);
 assert.match(notes,/2027-09-19/);
 assert.match(notes,/candidate for a revocable grant/);
 assert.match(notes,/NO-GO/);
});

test("production read-only gate includes future renewal and missing ministry letter checks",()=>{
 assert.match(sql,/renewal_date > \(now\(\) AT TIME ZONE 'Asia\/Manila'\)::date/);
 assert.match(sql,/status IN \('New','Renewed'\)/);
 assert.match(sql,/NULLIF\(btrim\(document_url\),' '\)|NULLIF\(btrim\(document_url\),''\)/);
 assert.match(notes,/0.*mismatched one-year Renewed assignments/);
 assert.match(notes,/Ministry of Liturgical Music/);
});
