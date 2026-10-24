const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const filename = path.resolve(__dirname, "../lib/duplicate-check.ts");
const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

function harness(failAt) {
  const calls = { insert: 0, lookup: 0, ranges: [] };
  const client = {
    from(table) {
      let phase = "lookup";
      let fromIndex = 0;
      const query = {
        select() { return query; },
        ilike() { return query; },
        not() { return query; },
        eq() { return query; },
        range(from) { phase = "range"; fromIndex = from; return query; },
        insert() { calls.insert++; return query; },
        single() { return Promise.resolve({ data: null, error: null }); },
        maybeSingle() { return Promise.resolve({ data: null, error: null }); },
        then(resolve, reject) {
          let response = { data: [], error: null };
          if (table === "members" && phase === "lookup") {
            calls.lookup++;
            if ((failAt === "exact" && calls.lookup === 1) ||
                (failAt === "parish" && calls.lookup === 2)) {
              response = { data: null, error: { message: "simulated unavailable" } };
            }
          }
          if (table === "members" && phase === "range") {
            calls.ranges.push(fromIndex);
            if (failAt === "pagination") {
              response = { data: null, error: { message: "simulated page failure" } };
            }
          }
          return Promise.resolve(response).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const m = new Module(filename, module);
  m.filename = filename;
  m.paths = module.paths;
  m.require = (request) => {
    if (request === "@/lib/supabase/client") return { getSupabaseBrowserClient: () => client };
    if (request === "@/lib/constants") return {
      MINISTRIES: ["Ministry of Liturgical Music"],
      shortMinistry: (x) => x,
    };
    if (request === "@/lib/types") return {};
    if (request === "@/lib/registration-matching") {
      return {
        areNamesSimilar: (a, b) => a.toLowerCase() === b.toLowerCase(),
        similarityRatio: (a, b) => a.toLowerCase() === b.toLowerCase() ? 1 : 0,
        classifyIdentityMatch: () => null,
      };
    }
    return require(request);
  };
  m._compile(source, filename);
  return { api: m.exports, calls };
}
const incoming = {
  first_name: "Test", last_name: "Person", parish: "Sample Parish",
  ministries: ["Ministry of Liturgical Music"], service_year: 2026,
};
for (const failure of ["exact", "parish", "pagination"]) {
  test("individual intake blocks writes on " + failure + " lookup failure", async () => {
    const { api, calls } = harness(failure);
    const response = await api.importSingleMember(incoming);
    assert.equal(response.status, "error");
    assert.match(response.error, /not saved/i);
    assert.equal(calls.insert, 0);
  });
}
test("batch intake throws before inserts when full-registry lookup fails", async () => {
  const { api, calls } = harness("pagination");
  await assert.rejects(
    api.stageBatchRecords([{ first_name:"Test", last_name:"Person", parish:"Sample Parish", ministry:"Ministry of Liturgical Music" }], undefined, 2026),
    /simulated page failure/
  );
  assert.equal(calls.insert, 0);
});
test("successful empty-registry duplicate scan permits staging", async () => {
  const { api, calls } = harness(null);
  const result = await api.stageBatchRecords([{ first_name:"Test",last_name:"Person",parish:"Sample Parish",ministry:"Ministry of Liturgical Music" }], undefined, 2026);
  assert.equal(result.unique.length, 1);
  assert.equal(calls.insert, 0);
});
