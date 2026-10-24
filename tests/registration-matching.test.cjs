/* Offline tests for the real TypeScript matching module. No Supabase required. */
const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const filename = path.resolve(__dirname, "../lib/registration-matching.ts");
const source = fs.readFileSync(filename, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const loaded = new Module(filename, module);
loaded.filename = filename;
loaded.paths = module.paths;
loaded._compile(compiled, filename);
const { classifyIdentityMatch, areNamesSimilar } = loaded.exports;

const person = (first_name, last_name, parish = "Parish A") => ({
  first_name, last_name, parish,
});

test("exact name and parish, insensitive to case and repeated spaces", () => {
  assert.equal(
    classifyIdentityMatch(person(" Juan ", "Dela  Cruz"), person("juan", "dela cruz")),
    "exact"
  );
});

test("same name at a different parish always needs manual review", () => {
  assert.equal(
    classifyIdentityMatch(person("Juan", "Dela Cruz"), person("Juan", "Dela Cruz", "Parish B")),
    "same_name_different_parish"
  );
});

test("similar names are held for review", () => {
  assert.equal(
    classifyIdentityMatch(person("Jonathan", "Santos"), person("Jonatan", "Santos")),
    "similar_name"
  );
});

test("unrelated names do not match", () => {
  assert.equal(classifyIdentityMatch(person("Maria", "Reyes"), person("Pedro", "Santos")), null);
});

test("numeric name suffixes are not conflated", () => {
  assert.equal(classifyIdentityMatch(person("Subject 3", "Santos"), person("Subject 4", "Santos")), null);
  assert.equal(areNamesSimilar("Juan 2", "Juan 3"), false);
});

test("short names require an exact match", () => {
  assert.equal(areNamesSimilar("Ana", "Ann"), false);
  assert.equal(areNamesSimilar("Ana", "ANA"), true);
});

test("missing identity fields cannot be considered safe matches", () => {
  assert.equal(classifyIdentityMatch(person("", "Reyes"), person("Maria", "Reyes")), null);
});

test("identical short first name still allows a fuzzy surname match", () => {
  assert.equal(
    classifyIdentityMatch(person("Ana", "Fitzgerald"), person("Ana", "Fitzgeralt")),
    "similar_name"
  );
});

test("identical short surname still allows a fuzzy first-name match", () => {
  assert.equal(
    classifyIdentityMatch(person("Fitzgerald", "Ana"), person("Fitzgeralt", "Ana")),
    "similar_name"
  );
});

test("different short first names are not fuzzy matched even when surnames resemble", () => {
  assert.equal(
    classifyIdentityMatch(person("Ana", "Fitzgerald"), person("Ann", "Fitzgeralt")),
    null
  );
});
