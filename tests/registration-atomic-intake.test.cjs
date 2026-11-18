const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
const cache = new Map();
function load(name) {
  if (cache.has(name)) return cache.get(name);
  const filename = path.join(root, "lib", name + ".ts");
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const m = new Module(filename, module);
  m.filename = filename;
  m.require = (request) => request === "./constants"
    ? { MINISTRIES: [
      "Mother Butler Guild", "Ministry of Greeters and Collectors",
      "Extraordinary Ministers of Holy Communion", "Ministry of Lectors and Commentators",
      "Ministry of Liturgical Music", "Ministry of Altar Servers",
    ], shortMinistry: (x) => x }
    : request.startsWith("./") ? load(request.slice(2)) : require(request);
  cache.set(name, m.exports);
  m._compile(source, filename);
  cache.set(name, m.exports);
  return m.exports;
}
const { prepareAtomicRegistrationArgs: prepare, normalizeAtomicRegistrationResult: parse, submitAtomicRegistrationForReview: submit } = load("registration-atomic-intake");
const first = "11111111-1111-4111-8111-111111111111";
const member = "22222222-2222-4222-8222-222222222222";
const review = "33333333-3333-4333-8333-333333333333";
const input = { requestKey: first, first_name: " Maria  ", last_name: " Santos ", parish: " Sample Parish ", ministries: ["Ministry of Liturgical Music"], service_year: 2026 };

test("prepares exact staging RPC arguments and normalizes names", () => {
  assert.deepEqual(prepare(input), { p_request: first, p_first: "Maria", p_last: "Santos", p_parish: "Sample Parish", p_ministries: ["Ministry of Liturgical Music"], p_year: 2026 });
});
test("accepts each canonical ministry without inventing Lector", () => {
  const all = ["Mother Butler Guild", "Ministry of Greeters and Collectors", "Extraordinary Ministers of Holy Communion", "Ministry of Lectors and Commentators", "Ministry of Liturgical Music", "Ministry of Altar Servers"];
  assert.deepEqual(prepare({ ...input, ministries: all }).p_ministries, all);
  assert.throws(() => prepare({ ...input, ministries: ["Lector"] }), /unique approved/);
});
test("rejects repeated ministry names", () => {
  assert.throws(() => prepare({ ...input, ministries: [...input.ministries, ...input.ministries] }), /unique approved/);
});
test("rejects an invalid request key", () => {
  assert.throws(() => prepare({ ...input, requestKey: "new-request" }), /stable request UUID/);
});
test("rejects invalid service year and long identities", () => {
  assert.throws(() => prepare({ ...input, service_year: 1899 }), /service year/);
  assert.throws(() => prepare({ ...input, parish: "a".repeat(201) }), /allowed limits/);
});
test("refuses notes rather than silently dropping them", () => {
  assert.throws(() => prepare({ ...input, notes: "Important parish note" }), /notes are not supported/);
  assert.deepEqual(prepare({ ...input, notes: " " }).p_ministries, input.ministries);
});
test("accepts created and review responses with verified UUIDs", () => {
  assert.deepEqual(parse({ status: "created", memberId: member }), { status: "created", memberId: member });
  assert.deepEqual(parse({ status: "review", reviewId: review }), { status: "review", reviewId: review });
});
test("accepts replay of created and review outcomes", () => {
  assert.deepEqual(parse({ status: "replayed", outcome: "created", memberId: member, reviewId: null }), { status: "replayed", outcome: "created", memberId: member });
  assert.deepEqual(parse({ status: "replayed", outcome: "review", reviewId: review, memberId: null }), { status: "replayed", outcome: "review", reviewId: review });
});
test("rejects malformed and ambiguous responses", () => {
  for (const result of [null, [], "created", { status: "created" }, { status: "review", reviewId: "bad" }, { status: "replayed", outcome: "created", reviewId: review }, { status: "created", memberId: member, reviewId: review }]) {
    assert.throws(() => parse(result), /Invalid atomic registration response/);
  }
});
test("disabled adapter never invokes a database transport", async () => {
  let calls = 0;
  await assert.rejects(submit(input, async () => { calls++; return { data: {status: "created", memberId: member}, error: null }; }, { explicitlyEnabled: false }), /not enabled/);
  assert.equal(calls, 0);
});
test("enabled review adapter uses exactly one expected RPC with fixed request UUID", async () => {
  let calls = 0;
  const result = await submit(input, async (name, args) => {
    calls++;
    assert.equal(name, "registration_intake_v1");
    assert.equal(args.p_request, first);
    return { data: {status:"review",reviewId:review}, error:null };
  }, { explicitlyEnabled: true });
  assert.equal(calls, 1);
  assert.deepEqual(result, {status:"review",reviewId:review});
});
test("DB permission errors and request fingerprint conflict fail closed", async () => {
  await assert.rejects(submit(input, async () => ({ data: null, error: { code:"42501", message:"denied" } }), { explicitlyEnabled:true }), /No success is confirmed/);
  await assert.rejects(submit(input, async () => ({ data: null, error: { code:"23505", message:"conflict" } }), { explicitlyEnabled:true }), /reused with different/);
});
test("does not mistake null response for a successful write", async () => {
  await assert.rejects(submit(input, async () => ({ data: null, error:null }), { explicitlyEnabled:true }), /Invalid atomic registration response/);
});
