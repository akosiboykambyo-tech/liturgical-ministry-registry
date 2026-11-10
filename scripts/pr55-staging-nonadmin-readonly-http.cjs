#!/usr/bin/env node
/**
 * PR55: READ-ONLY real Auth/JWT denial test against the isolated Supabase staging project.
 * Never point this at production; URL is intentionally fixed and cannot be overridden.
 * No member, ministry, letter, Storage object, grant, or login-account mutation is made.
 * Environment credentials remain local and are never printed.
 */
"use strict";
const assert = require("node:assert/strict");

const origin = "https://rtptybxugjhvpfjvcvgw.supabase.co";
const required = [
  "PR55_STAGING_PUBLISHABLE_KEY",
  "PR55_STAGING_AUTH_EMAIL",
  "PR55_STAGING_AUTH_PASSWORD",
  "PR55_STAGING_NONADMIN_AUTH_EMAIL",
  "PR55_STAGING_NONADMIN_AUTH_PASSWORD",
];
const config = process.env;
const consent = "I_ACCEPT_READONLY_STAGING_REAL_JWT";
if (config.PR55_ALLOW_NEGATIVE_HTTP !== consent) {
  console.error("REFUSED: explicit staging read-only HTTP test opt-in required.");
  process.exit(2);
}
if (required.some(key => !config[key]) ||
    !config.PR55_STAGING_PUBLISHABLE_KEY.startsWith("sb_publishable_") ||
    config.PR55_STAGING_AUTH_EMAIL.trim().toLowerCase() ===
      config.PR55_STAGING_NONADMIN_AUTH_EMAIL.trim().toLowerCase()) {
  console.error("REFUSED: two distinct staging Auth accounts and staging publishable key are required.");
  process.exit(2);
}
if (process.argv.includes("--validate-config")) {
  console.log("PASS: staging test configuration recognized; NO requests performed.");
  process.exit(0);
}
if (process.argv.length !== 3 || process.argv[2] !== "--run") {
  console.error("REFUSED: use --validate-config or --run.");
  process.exit(2);
}
const key = config.PR55_STAGING_PUBLISHABLE_KEY;

async function call(path, {method = "GET", bearer, body} = {}) {
  const headers = { apikey: key, Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (bearer) headers.Authorization = "Bearer " + bearer;
  const response = await fetch(origin + path, {
    method, headers, redirect: "error",
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  let data = null;
  try { data = await response.json(); } catch { /* do not print response */ }
  return {status: response.status, data};
}
async function login(email, password, label) {
  const r = await call("/auth/v1/token?grant_type=password", {
    method: "POST", body: {email, password},
  });
  if (r.status !== 200 || typeof r.data?.access_token !== "string") {
    throw new Error(label + " login rejected; HTTP " + r.status + " (details redacted)");
  }
  const token = r.data.access_token;
  const identity = await call("/auth/v1/user", {bearer: token});
  if (identity.status !== 200 || typeof identity.data?.id !== "string") {
    throw new Error(label + " token was not verified by Auth");
  }
  console.log("PASS: real " + label + " Auth JWT verified");
  return {token, id: identity.data.id};
}
async function safeRows(path, token, label, expectedNonEmpty) {
  const r = await call(path + "?select=id&limit=1", {bearer: token});
  if (!expectedNonEmpty && [401, 403].includes(r.status)) {
    console.log("PASS: " + label + " (REST denied by HTTP " + r.status + ")");
    return;
  }
  assert.equal(r.status, 200, label + " REST read failed, HTTP " + r.status);
  assert.ok(Array.isArray(r.data), label + " returned unexpected REST payload");
  if (expectedNonEmpty) assert.equal(r.data.length, 1, label + " cannot see staging registry");
  else assert.equal(r.data.length, 0, label + " unexpectedly saw protected rows");
  console.log("PASS: " + label);
}
async function assertDeniedRpc(name, token, body) {
  const r = await call("/rest/v1/rpc/" + name, {method: "POST", bearer: token, body});
  if (![401,403].includes(r.status) || r.data?.code !== "42501") {
    throw new Error(name + " not denied with HTTP 401/403 + SQLSTATE 42501; HTTP " + r.status);
  }
  console.log("PASS: nonadmin " + name + " denied (42501)");
}
async function main() {
  const admin = await login(config.PR55_STAGING_AUTH_EMAIL,
    config.PR55_STAGING_AUTH_PASSWORD, "administrator");
  const outsider = await login(config.PR55_STAGING_NONADMIN_AUTH_EMAIL,
    config.PR55_STAGING_NONADMIN_AUTH_PASSWORD, "non-administrator");
  assert.notEqual(admin.id, outsider.id, "The two JWTs map to the same Auth identity");

  const adminGrant = await call("/rest/v1/rpc/registration_is_admin", {
    method: "POST", bearer: admin.token, body: {},
  });
  const guestGrant = await call("/rest/v1/rpc/registration_is_admin", {
    method: "POST", bearer: outsider.token, body: {},
  });
  assert.equal(adminGrant.status, 200, "Admin RPC self-check unavailable");
  assert.equal(adminGrant.data, true, "Granted admin was denied");
  assert.equal(guestGrant.status, 200, "Nonadmin RPC self-check unavailable");
  assert.equal(guestGrant.data, false, "Nonadmin unexpectedly has a grant");
  console.log("PASS: server-authorized grant is true for admin, false for nonadmin");

  await safeRows("/rest/v1/members", admin.token, "administrator members visible", true);
  await safeRows("/rest/v1/member_ministries", admin.token,
    "administrator ministry assignments visible", true);
  await safeRows("/rest/v1/members", outsider.token, "nonadmin members hidden", false);
  await safeRows("/rest/v1/member_ministries", outsider.token,
    "nonadmin ministry assignments hidden", false);

  // Both privileged procedures must deny BEFORE validating the deliberately
  // nonexistent IDs; therefore no business records can be written.
  const first = "11111111-1111-4111-8111-111111111111";
  const second = "22222222-2222-4222-8222-222222222222";
  await assertDeniedRpc("registry_verify_ministries_v1", outsider.token, {
    p_member_id: first, p_membership_ids: [second], p_status: "New",
  });
  await assertDeniedRpc("registry_attach_ministry_letter_v1", outsider.token, {
    p_member_id: first, p_membership_id: second,
    p_document_path: "verification/placeholder.pdf",
  });
  console.log("PASS: live nonadmin HTTP/JWT read and privileged-RPC denial tests complete");
  console.log("LIMIT: Storage bucket currently has no objects; private file-download denial is not certified");
  console.log("LIMIT: production's hardened renewal RPC and full Auth/Storage recovery require separate checks");
}
main().catch(error => {
  // Do not print response bodies, credentials or account identifiers.
  console.error("FAIL: " + String(error?.message || "test failed").replace(
    /(?:sb_publishable_|eyJ)[^\s]+/g, "[REDACTED]"
  ));
  process.exitCode = 1;
});
