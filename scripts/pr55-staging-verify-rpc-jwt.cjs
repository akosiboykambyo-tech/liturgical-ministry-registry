#!/usr/bin/env node
/**
 * PR55: real Supabase Auth/PostgREST JWT checks for the installed isolated
 * staging registry_verify_ministries_v1. NO MEMBER OR MINISTRY WRITES.
 *
 * Usage: node scripts/pr55-staging-verify-rpc-jwt.cjs --validate-config
 *        node scripts/pr55-staging-verify-rpc-jwt.cjs --run
 *
 * Requires PR55_STAGING_PUBLISHABLE_KEY, PR55_STAGING_AUTH_EMAIL,
 * PR55_STAGING_AUTH_PASSWORD, PR55_STAGING_NONADMIN_AUTH_EMAIL,
 * PR55_STAGING_NONADMIN_AUTH_PASSWORD and explicit PR55_ALLOW_VERIFY_JWT_PROBE.
 *
 * Does not print keys, emails, passwords, JWTs, full responses or member IDs.
 */
"use strict";
const assert = require("node:assert/strict");
const ORIGIN = "https://rtptybxugjhvpfjvcvgw.supabase.co";
const OPT_IN = "I_ACCEPT_READONLY_STAGING_AUTH_TESTS";
const env = process.env;
const flag = env.PR55_ALLOW_VERIFY_JWT_PROBE;
const pub = env.PR55_STAGING_PUBLISHABLE_KEY || "";
const adminEmail = env.PR55_STAGING_AUTH_EMAIL || "";
const adminPassword = env.PR55_STAGING_AUTH_PASSWORD || "";
const nonEmail = env.PR55_STAGING_NONADMIN_AUTH_EMAIL || "";
const nonPassword = env.PR55_STAGING_NONADMIN_AUTH_PASSWORD || "";
const command = process.argv[2];

function refuse(message) {
  console.error("REFUSED: " + message);
  process.exit(2);
}
if (!["--validate-config", "--run"].includes(command) || process.argv.length !== 3) {
  refuse("use --validate-config or --run; no request sent");
}
if (flag !== OPT_IN) refuse("explicit isolated staging read-only opt-in is required");
if (![pub, adminEmail, adminPassword, nonEmail, nonPassword].every(Boolean)) {
  refuse("staging publishable key and both staging Auth credentials are required");
}
if (adminEmail.trim().toLowerCase() === nonEmail.trim().toLowerCase()) {
  refuse("admin and nonadmin staging Auth identities must differ");
}
if (pub.length < 12 || /\s/.test(pub)) refuse("invalid staging publishable key");
if (command === "--validate-config") {
  console.log("PASS: isolated staging configuration validated; NO requests made");
  process.exit(0);
}
async function request(path, method, body, token) {
  const headers = {
    apikey: pub,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (token) headers.Authorization = "Bearer " + token;
  const response = await fetch(ORIGIN + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  // Never emit a raw server response; it can contain private data.
  const raw = await response.text();
  let parsed = {};
  try { parsed = JSON.parse(raw); } catch { /* non-JSON is an error */ }
  return { status: response.status, code: parsed?.code || null, data: parsed };
}
async function login(email, password) {
  const r = await request("/auth/v1/token?grant_type=password", "POST", { email, password });
  if (r.status !== 200 || typeof r.data?.access_token !== "string") {
    throw new Error("staging Auth sign-in failed (" + r.status + "); check local credentials");
  }
  if (!r.data.user?.id) throw new Error("staging Auth token lacked user identity");
  return { token: r.data.access_token, id: r.data.user.id };
}
const invalidInput = {
  p_member_id: null, p_membership_ids: [], p_status: "New",
};
function expectRpcFailure(label, response, code) {
  if (response.code !== code || ![400, 401, 403].includes(response.status)) {
    throw new Error(
      label + " unexpectedly returned HTTP " + response.status +
      " / SQLSTATE " + (response.code || "missing") + " (expected " + code + ")"
    );
  }
  console.log("PASS: " + label + " denied/validated as expected (" + code + ")");
}
async function run() {
  const admin = await login(adminEmail, adminPassword);
  const nonadmin = await login(nonEmail, nonPassword);
  assert.notEqual(admin.id, nonadmin.id, "staging identities must be distinct");
  console.log("PASS: two distinct real Supabase Auth staging JWTs obtained");

  const anon = await request("/rest/v1/rpc/registry_verify_ministries_v1",
    "POST", invalidInput);
  expectRpcFailure("anonymous EXECUTE", anon, "42501");

  const ungranted = await request("/rest/v1/rpc/registry_verify_ministries_v1",
    "POST", invalidInput, nonadmin.token);
  expectRpcFailure("ungranted authenticated caller", ungranted, "42501");

  const granted = await request("/rest/v1/rpc/registry_verify_ministries_v1",
    "POST", invalidInput, admin.token);
  expectRpcFailure("granted administrator invalid request", granted, "22023");

  const adminRows = await request("/rest/v1/member_ministries?select=id&limit=1",
    "GET", undefined, admin.token);
  if (adminRows.status !== 200 || !Array.isArray(adminRows.data) ||
      adminRows.data.length !== 1) {
    throw new Error("granted admin RLS SELECT did not return one staging assignment");
  }
  console.log("PASS: granted admin reads canonical assignment through RLS");

  const otherRows = await request("/rest/v1/member_ministries?select=id&limit=1",
    "GET", undefined, nonadmin.token);
  if (otherRows.status !== 200 || !Array.isArray(otherRows.data) ||
      otherRows.data.length !== 0) {
    throw new Error("ungranted user must see zero ministry assignments under RLS");
  }
  console.log("PASS: ungranted user sees zero ministry assignments under RLS");

  console.log("PASS: real-JWT read-only staging verification complete; NO registry writes requested");
}
run().catch((cause) => {
  // Do not print raw server bodies; diagnostic messages above contain no secrets.
  const msg = cause instanceof Error ? cause.message : "Unknown staging HTTP failure";
  if (/(password|token|credential|secret|email)/i.test(msg)) {
    console.error("FAIL: staging authentication or HTTP validation failed (details redacted)");
  } else {
    console.error("FAIL: " + msg);
  }
  process.exitCode = 1;
});
