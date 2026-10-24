#!/usr/bin/env node
"use strict";
// Test-only HTTP integration harness. Writes fictional members to isolated test DB
// ONLY after explicit opt-in. Never run against a deployed production URL.
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

const project = "rtptybxugjhvpfjvcvgw";
const url = process.env.SECURE_REGISTRATION_TEST_BASE_URL;
const token = process.env.SECURE_REGISTRATION_TEST_ACCESS_TOKEN;
if (process.env.SECURE_REGISTRATION_RUN_WRITE_TESTS !== "I_ACCEPT_TEST_DATABASE_WRITES") {
  console.error("Refusing to write: explicit isolated-test opt-in required.");
  process.exit(2);
}
if (!url || !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(url)) {
  console.error("Refusing to run against non-localhost server.");
  process.exit(2);
}
if (!token) {
  console.error("Missing SECURE_REGISTRATION_TEST_ACCESS_TOKEN (real isolated test admin session).");
  process.exit(2);
}
if (process.env.NEXT_PUBLIC_SUPABASE_URL !== `https://${project}.supabase.co` ||
    process.env.SECURE_REGISTRATION_TEST_PROJECT !== project) {
  console.error("Refusing: Supabase configuration must point to the isolated test project.");
  process.exit(2);
}
const route = new URL("/api/admin/secure-registration", url).toString();
const reference = randomUUID();
const first = "Harness" + reference.slice(0, 8);
const last = "Fictional" + reference.slice(9, 13);
const base = {
  source: { kind: "individual", reference },
  first_name: first,
  last_name: last,
  parish: "Training Parish",
  ministries: ["Ministry of Liturgical Music", "Ministry of Altar Servers"],
  service_year: 2026,
};
async function post(data, auth = token) {
  const res = await fetch(route, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + auth },
    body: JSON.stringify(data),
  });
  return { http: res.status, data: await res.json() };
}
async function main() {
  // Invalid token must be rejected before database writes.
  const unauthorized = await post({ ...base, requestKey: randomUUID() }, "invalid-token");
  assert.equal(unauthorized.http, 401, JSON.stringify(unauthorized));
  const key = randomUUID();
  const [a,b] = await Promise.all([
    post({ ...base, requestKey: key }),
    post({ ...base, requestKey: key }),
  ]);
  assert.deepEqual([a.data.status,b.data.status].sort(), ["created","replayed"], JSON.stringify([a,b]));
  assert.equal(a.data.memberId,b.data.memberId,"same request key must yield one member");
  const conflict = await post({ ...base, last_name: "Different" + last, requestKey:key });
  assert.equal(conflict.http,409,JSON.stringify(conflict));
  const review = await post({ ...base, requestKey: randomUUID() });
  assert.equal(review.data.status,"review",JSON.stringify(review));
  assert.match(review.data.reviewId,/^[0-9a-f-]{36}$/i);
  const secondReview = await post({ ...base, requestKey: randomUUID() });
  assert.equal(secondReview.data.status,"review",JSON.stringify(secondReview));
  // Different idempotency keys for the same new identity are the distinct race.
  const distinctName = { ...base, first_name: "Race" + reference.slice(0, 8), last_name: "Parallel" + reference.slice(9, 13) };
  const [r1, r2] = await Promise.all([
    post({ ...distinctName, requestKey: randomUUID() }),
    post({ ...distinctName, requestKey: randomUUID() }),
  ]);
  assert.deepEqual([r1.data.status, r2.data.status].sort(), ["created", "review"], JSON.stringify([r1, r2]));
  assert.match((r1.data.reviewId || r2.data.reviewId), /^[0-9a-f-]{36}$/i);
  console.log("PASS: invalid token, same-key replay, different-key race, conflict, duplicate review");
  console.log("IMPORTANT: synthetic test members and review cases were written to ISOLATED TEST database.");
  console.log("Test reference:", reference);
}
main().catch(e => {console.error("INTEGRATION TEST FAILED:",e.message);process.exitCode=1;});
