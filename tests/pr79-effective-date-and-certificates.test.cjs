const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const Module = require("node:module");
const root = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

function tsModule(file, cache = new Map()) {
  if (cache.has(file)) return cache.get(file);
  const filename = path.join(root, file);
  const code = ts.transpileModule(read(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = module.paths;
  mod.require = (name) => {
    if (name === "@/lib/verification-public-status") {
      return tsModule("lib/verification-public-status.ts", cache);
    }
    return require(name);
  };
  mod._compile(code, filename);
  cache.set(file, mod.exports);
  return mod.exports;
}

test("historical one-year dates use anniversary including leap-day clamp", () => {
  const validity = tsModule("lib/registration-validity.ts");
  assert.equal(validity.expirationOneYearAfter("2026-03-15"), "2027-03-15");
  assert.equal(validity.expirationOneYearAfter("2024-02-29"), "2025-02-28");
  assert.equal(validity.isRegistrationValidOn("2027-03-15", "2027-03-15"), "valid");
  assert.equal(validity.isRegistrationValidOn("2027-03-15", "2027-03-16"), "expired");
});

test("member dates and certificate eligibility use the Manila day", () => {
  const publicStatus = tsModule("lib/verification-public-status.ts");
  const constants = tsModule("lib/constants.ts");
  const today = publicStatus.todayInManila();
  const membership = { ministry: "Ministry of Greeters and Collectors", status: "New", expiration_date: today };
  assert.equal(publicStatus.isCurrentMembership(membership), true);
  assert.equal(constants.getExpirationStatus(today), "expiring_soon");
  assert.equal(constants.getExpirationStatus("2026-02-30"), "none");
  assert.equal(publicStatus.isCurrentMembership({ ...membership, expiration_date: null }), false);
});

test("letter upload never establishes membership validity", () => {
  const upload = read("lib/registry-letter-attachments.ts");
  assert.match(upload, /No renewal|never writes/);
  assert.match(upload, /registry_attach_ministry_letters_v2/);
  assert.doesNotMatch(upload, /registry_verify_ministries_v[23]/);
  const v3 = read("docs/sql/pr79-documented-effective-date.STAGING-TESTED.sql");
  assert.match(v3, /p_effective_date date/);
  assert.match(v3, /p_effective_date < v_today/);
  assert.match(v3, /length\(coalesce\(btrim\(p_reason\)/);
  assert.match(v3, /registry_private\.registration_administrators/);
  assert.match(v3, /mm\.document_url IS NULL/);
  assert.match(v3, /FROM storage\.objects/);
  assert.match(v3, /INSERT INTO public\.audit_logs/);
  assert.match(v3, /'approved_by', v_actor/);
  assert.match(v3, /GRANT EXECUTE ON FUNCTION public\.registry_verify_ministries_v3[\s\S]*TO authenticated, service_role/);
});

test("explicitly selected ministry approval must require letter review and audited effective date", () => {
  const action = read("lib/secure-ministry-verification.ts");
  const screen = read("components/secure-ministry-verification.tsx");
  assert.match(action, /registry_verify_ministries_v3/);
  assert.match(action, /p_effective_date: effectiveDate/);
  assert.match(action, /p_reason: recordedReason/);
  assert.doesNotMatch(action, /registry_verify_ministries_v2/);
  assert.match(screen, /!row\?\.document_url \|\| !reviewedIds\.has\(id\)/);
  assert.match(screen, /!assignment\.document_url \|\| !reviewedIds\.has\(assignment\.id\)/);
  assert.match(screen, /Documented ministry effective date/);
  assert.match(screen, /Backdated verification requires an audit reason/);
  assert.doesNotMatch(screen, /optional for initial registration/);
});

test("member drawer lazy thumbnail uses low-resolution render, and no auto full-resolution renderer", () => {
  const screen = read("components/member-detail-drawer.tsx");
  assert.match(screen, /Math\.min\(1, 340 \/ \(certificateSettings\.canvas_width \|\| 600\)\)/);
  assert.match(screen, /thumbnailCache\.current\.set/);
  assert.match(screen, /renderCertificate\(canvas, certificateData, certificateSettings, certificateSignatories, scale\)/);
  assert.match(screen, /const ensureFullCertificate = async/);
  assert.match(screen, /const handleOpenCertificatePreview = async/);
  assert.match(screen, /const handlePrintCertificate = async/);
  assert.doesNotMatch(screen, /<CertificateDesign/);
  assert.doesNotMatch(screen, /getCanvas\(\)/);
  assert.match(screen, /start_date: null,/);
  assert.match(screen, /Status \(read-only\)/);
  assert.match(screen, /not by attaching a recommendation letter/);
  assert.doesNotMatch(screen, /type="date"\s*value=\{membership\.expiration_date/);
});

test("rendering code caches artwork for thumbnail, full preview and print", () => {
  const renderer = read("lib/certificate.ts");
  assert.match(renderer, /const certificateImageCache = new Map/);
  assert.match(renderer, /loadCertificateImage\(templateUrl\)/);
  assert.match(renderer, /const loadImage = loadCertificateImage/);
  assert.match(renderer, /certificateImageCache\.size > 12/);
});
