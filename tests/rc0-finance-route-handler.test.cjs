"use strict";

/**
 * RC0 finance authorization route regression tests.
 *
 * Executes the ACTUAL TypeScript GET handler with in-memory Supabase/Next
 * adapters; exercises its logic without connecting to any environment.
 * This does not replace signed-JWT HTTP, RLS or browser acceptance.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function compiled(relativePath) {
  const source = fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
  return ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: relativePath,
  }).outputText;
}

function loadModule(code, dependency, environment) {
  const module = { exports: {} };
  const context = {
    module,
    exports: module.exports,
    require: dependency,
    process: { env: environment },
    console: { error() {} },
  };
  vm.runInNewContext(code, context, { timeout: 1500 });
  return module.exports;
}

const financeModelCode = compiled("lib/financial-stewardship/access-model.ts");
const financeRouteCode = compiled("app/api/financial-stewardship/access/route.ts");
const financeModel = loadModule(financeModelCode, (name) => {
  throw new Error("Unexpected access-model dependency: " + name);
}, {});

const GOOD_GRANT = {
  role_code: "cowl_financial_workspace_viewer",
  granted_at: "2025-01-01T00:00:00Z",
  expires_at: "2099-01-01T00:00:00Z",
  revoked_at: null,
};

function harness({
  user = { id: "fixture-user", is_anonymous: false },
  authError = null,
  grants = [],
  grantError = null,
  adminResult = false,
  adminError = null,
  envReady = true,
} = {}) {
  const calls = [];
  const fakeClient = {
    auth: {
      getUser: async (token) => {
        calls.push(["auth", token]);
        return { data: { user }, error: authError };
      },
    },
    from(table) {
      calls.push(["from", table]);
      return {
        select(columns) {
          calls.push(["select", columns]);
          return {
            eq(column, value) {
              calls.push(["eq", column, value]);
              return {
                is(field, value) {
                  calls.push(["is", field, value]);
                  return Promise.resolve({ data: grants, error: grantError });
                },
              };
            },
          };
        },
      };
    },
    async rpc(name) {
      calls.push(["rpc", name]);
      return { data: adminResult, error: adminError };
    },
  };
  const environment = envReady ? {
    NEXT_PUBLIC_SUPABASE_URL: "https://fixture.invalid",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "not-a-real-key",
  } : {};
  const route = loadModule(financeRouteCode, (name) => {
    if (name === "@supabase/supabase-js") {
      return {
        createClient(url, key, options) {
          calls.push(["createClient", url, key, options.global.headers.Authorization]);
          return fakeClient;
        },
      };
    }
    if (name === "next/server") {
      return {
        NextResponse: {
          json(body, { status, headers }) {
            return { status, body, headers };
          },
        },
      };
    }
    if (name === "@/lib/financial-stewardship/access-model") return financeModel;
    throw new Error("Unexpected access-route dependency: " + name);
  }, environment);
  return { GET: route.GET, calls };
}

function request({ token = "synthetic-jwt", workspace = "all", section = null } = {}) {
  const params = new URLSearchParams({ workspace });
  if (section !== null) params.set("section", section);
  return {
    headers: {
      get(name) {
        return name.toLowerCase() === "authorization" && token
          ? "Bearer " + token
          : null;
      },
    },
    nextUrl: { searchParams: params },
  };
}

test("missing bearer token returns 401 before Supabase client creation", async () => {
  const h = harness({ grants: [GOOD_GRANT] });
  const response = await h.GET(request({ token: null }));
  assert.equal(response.status, 401);
  assert.equal(h.calls.length, 0);
  assert.equal(response.headers["Cache-Control"], "private, no-store, max-age=0");
});

test("unverified and anonymous users cannot inherit a finance grant", async () => {
  for (const user of [null, { id: "fixture-user", is_anonymous: true }]) {
    const h = harness({ user, grants: [GOOD_GRANT] });
    const response = await h.GET(request());
    assert.equal(response.status, 401);
    assert.equal(h.calls.some((call) => call[0] === "from"), false);
  }
});

test("finance lookup error denies access instead of falling back to registry", async () => {
  const h = harness({
    grants: [GOOD_GRANT],
    grantError: { code: "42P01" },
    adminResult: true,
  });
  const response = await h.GET(request());
  assert.equal(response.status, 503);
  assert.equal(h.calls.some((call) => call[0] === "rpc"), false);
});

test("no active finance grant returns 403 even when registry admin exists", async () => {
  const h = harness({ adminResult: true });
  const response = await h.GET(request());
  assert.equal(response.status, 403);
  assert.equal(response.body.home, null);
  assert.equal(h.calls.find((call) => call[0] === "eq")[2], "fixture-user");
  assert.equal(h.calls.find((call) => call[0] === "is")[1], "revoked_at");
});

test("COWL viewer cannot open Curia inventory; permitted COWL home is returned", async () => {
  const h = harness({ grants: [GOOD_GRANT] });
  const response = await h.GET(request({ workspace: "curia", section: "inventory" }));
  assert.equal(response.status, 403);
  assert.equal(response.body.home, "/financial-stewardship");
  assert.equal(response.body.access.curia.length, 0);
});

test("Curia viewer can access Curia inventory but no COWL sections", async () => {
  const h = harness({ grants: [
    { ...GOOD_GRANT, role_code: "curia_financial_workspace_viewer" },
  ] });
  const response = await h.GET(request({ workspace: "curia", section: "inventory" }));
  assert.equal(response.status, 200);
  assert.equal(response.body.home, "/curia");
  assert.equal(response.body.access.cowl.length, 0);
  assert.equal(response.body.access.curia.length, 2);
});

test("expired and revoked finance grants fail closed", async () => {
  for (const changes of [
    { expires_at: "2025-02-01T00:00:00Z" },
    { revoked_at: "2025-02-01T00:00:00Z" },
    { granted_at: "2099-01-01T00:00:00Z" },
  ]) {
    const h = harness({ grants: [{ ...GOOD_GRANT, ...changes }] });
    const response = await h.GET(request());
    assert.equal(response.status, 403);
  }
});

test("optional registry-role lookup failure never blocks approved finance", async () => {
  const h = harness({
    grants: [GOOD_GRANT],
    adminError: { code: "42501" },
  });
  const response = await h.GET(request({ workspace: "cowl", section: "inventory" }));
  assert.equal(response.status, 200);
  assert.equal(response.body.registryAdmin, false);
});

test("malformed workspace and section are refused before a database query", async () => {
  for (const options of [
    { workspace: "registry", section: "inventory" },
    { workspace: "curia", section: "registry-admin" },
  ]) {
    const h = harness({ grants: [GOOD_GRANT] });
    const response = await h.GET(request(options));
    assert.equal(response.status, 400);
    assert.equal(h.calls.length, 0);
  }
});

test("missing Supabase configuration returns 503 with no network calls", async () => {
  const h = harness({ envReady: false });
  const response = await h.GET(request());
  assert.equal(response.status, 503);
  assert.equal(h.calls.length, 0);
});
