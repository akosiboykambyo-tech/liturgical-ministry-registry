/**
 * PR55 staging-only real HTTP/JWT smoke probe. Requires Node >= 20.
 * Does NOT create, update, or delete a member/review/grant.
 * Credentials and bearer tokens stay in memory and are never printed.
 */
"use strict";
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

const origin = "https://rtptybxugjhvpfjvcvgw.supabase.co";
const key = process.env.PR55_STAGING_PUBLISHABLE_KEY || "";
const email = process.env.PR55_STAGING_AUTH_EMAIL || "";
const password = process.env.PR55_STAGING_AUTH_PASSWORD || "";
const optIn = "I_ACCEPT_READONLY_STAGING_HTTP_JWT_TEST";
if (process.env.PR55_ALLOW_HTTP_TEST !== optIn) {
  console.error("REFUSED: explicit staging HTTP/JWT smoke opt-in required.");
  process.exit(2);
}
if (!key.startsWith("sb_publishable_") || !email.includes("@") || !password) {
  console.error("REFUSED: missing staging publishable key or real staging Auth credentials.");
  process.exit(2);
}
if (process.argv.includes("--validate-config")) {
  console.log("PASS: isolated staging HTTP/JWT configuration accepted; NO requests made");
  process.exit(0);
}

async function request(path, {method="POST", bearer, body}={}) {
  const headers = { apikey: key, "Content-Type":"application/json" };
  if (bearer) headers.Authorization = "Bearer " + bearer;
  const response = await fetch(origin + path, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    redirect:"error", signal:AbortSignal.timeout(15000)
  });
  const text = await response.text();
  // Never disclose raw HTTP responses: Auth tokens and supplied identities may appear.
  let data;
  try { data = JSON.parse(text); } catch { data = null; }
  return {status:response.status,data};
}
function expectDenied(name,response) {
  assert.ok([401,403,404].includes(response.status),
    name + " must be denied by staging HTTP endpoint; HTTP " + response.status);
  console.log("PASS: " + name + " denied by HTTP status " + response.status);
}
async function main() {
  const noToken = await request("/rest/v1/rpc/registration_intake_v1", {
    body: {p_request:randomUUID(),p_first:"",p_last:"",p_parish:"",p_ministries:[],p_year:2026}
  });
  expectDenied("anonymous registration RPC", noToken);
  const invalidToken = await request("/rest/v1/rpc/registration_is_admin", {
    bearer: "not-a-real-jwt"
  });
  expectDenied("invalid bearer JWT", invalidToken);

  const login = await request("/auth/v1/token?grant_type=password", {
    body: {email,password}
  });
  assert.equal(login.status,200,
    "Real staging Auth sign-in failed; HTTP " + login.status + " (details redacted)");
  const jwt = login.data?.access_token;
  assert.equal(typeof jwt,"string","Staging Auth did not issue an access token");
  assert.ok(jwt.length > 50,"Issued Auth JWT is unexpectedly short");
  console.log("PASS: real staging Auth issued JWT");

  const identity = await request("/auth/v1/user", {method:"GET",bearer:jwt});
  assert.equal(identity.status,200,"Real JWT failed /auth/v1/user");
  assert.equal(typeof identity.data?.id,"string","Auth identity lacks ID");
  console.log("PASS: real bearer JWT verified by staging Auth");

  const check = await request("/rest/v1/rpc/registration_is_admin", {
    bearer:jwt
  });
  assert.equal(check.status,200,
    "Self-check RPC unavailable for real authenticated HTTP caller; HTTP " + check.status);
  assert.equal(check.data,true,
    "Signed-in staging user lacks the active registration administrator grant");
  console.log("PASS: real JWT maps to active staging registration administrator");

  // Exercise HTTP registration authorization with deliberately invalid input.
  // Both empty names and empty ministry list are rejected before writes.
  const invalid = await request("/rest/v1/rpc/registration_intake_v1",{
    bearer:jwt,
    body: {p_request:randomUUID(),p_first:"",p_last:"",
      p_parish:"",p_ministries:[],p_year:2026}
  });
  assert.equal(invalid.status,400,
    "Invalid authenticated registration must fail with HTTP 400; HTTP " + invalid.status);
  assert.equal(invalid.data?.code,"22023",
    "Registration must reach database validation and return SQLSTATE 22023");
  console.log("PASS: authenticated RPC reaches server-side validation; invalid request rejected without writes");
  console.log("LIMIT: candidate function is transaction-local in race tests; HTTP checks currently installed staging RPC");
  console.log("LIMIT: no non-admin JWT, committed revocation via HTTP, or valid-write registration tested");
}
main().catch(error=>{
  // Only hard-coded assertion messages and HTTP codes are intentionally used.
  console.error("FAIL:",error.message?.replace(/sb_publishable_[^\s]+/g,"[REDACTED]") ||
    "Staging HTTP smoke probe failed (details redacted)");
  process.exitCode=1;
});
