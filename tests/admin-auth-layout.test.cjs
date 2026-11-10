const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const shell = source("components/admin-auth-ui.tsx");
const pages = [
  "app/admin/page.tsx",
  "app/admin/forgot-password/page.tsx",
  "app/admin/reset-password/page.tsx",
  "app/admin/accept-invite/page.tsx",
  "app/admin/access-pending/page.tsx",
  "app/admin/reset-link-sent/page.tsx",
];

test("all six account pages use the original sign-in's exact shared responsive shell", () => {
  assert.match(shell, /min-h-\[205px\]/);
  assert.match(shell, /lg:grid-cols-\[minmax\(320px,42%\)_minmax\(0,1fr\)\]/);
  assert.match(shell, /max-w-\[440px\]/);
  assert.match(shell, /church-facade-placeholder\.svg/);
  assert.match(shell, /Asset_1\.svg/);
  for (const page of pages) {
    const content = source(page);
    assert.match(content, /<AdminAuthShell\b/, page);
    assert.doesNotMatch(content, /church-facade-placeholder\.svg/, "hero not duplicated: " + page);
    assert.doesNotMatch(content, /<main className=/, "no independent competing root: " + page);
  }
});

test("form controls and error/success states share common styles", () => {
  assert.match(shell, /authPrimaryButtonClass/);
  assert.match(shell, /authInputClass/);
  assert.match(shell, /authToggleClass/);
  assert.match(shell, /role="alert"/);
  assert.match(source("app/admin/page.tsx"), /<AuthError/);
  assert.match(source("app/admin/forgot-password/page.tsx"), /<AuthError/);
  assert.match(source("app/admin/reset-password/page.tsx"), /<AuthError/);
  assert.match(source("app/admin/accept-invite/page.tsx"), /<AuthError/);
  assert.match(source("app/admin/access-pending/page.tsx"), /<AuthError/);
});

test("the invitation and recovery screens use identical password requirement panels", () => {
  const invitation = source("app/admin/accept-invite/page.tsx");
  const recovery = source("app/admin/reset-password/page.tsx");
  assert.match(invitation, /<AuthPasswordRules rules=\{checks\}/);
  assert.match(recovery, /<AuthPasswordRules rules=\{rules\}/);
  assert.match(invitation, /aria-pressed=\{showPassword\}/);
  assert.match(recovery, /aria-pressed=\{showConfirm\}/);
  assert.match(recovery, /aria-pressed=\{show\}/);
});

test("unauthorized versus temporarily unavailable access show different copy", () => {
  const content = source("app/admin/access-pending/page.tsx");
  assert.match(content, /verificationUnavailable/);
  assert.match(content, /Role approval required/);
  assert.match(content, /Access verification unavailable/);
  assert.match(content, /authPrimaryButtonClass/);
});

test("existing sign-in and reset authorization operations remain present", () => {
  assert.match(source("app/admin/page.tsx"), /signIn\(email\.trim\(\), password\)/);
  assert.match(source("app/admin/page.tsx"), /registration_is_admin/);
  assert.match(source("app/admin/reset-password/page.tsx"), /auth\.verifyOtp/);
  assert.match(source("app/admin/accept-invite/page.tsx"), /auth\.verifyOtp/);
  assert.match(source("app/admin/reset-password/page.tsx"), /auth\.updateUser/);
  assert.match(source("app/admin/accept-invite/page.tsx"), /auth\.updateUser/);
});

test("informational reset-link page never invents a server-side retry countdown", () => {
  assert.doesNotMatch(source("app/admin/reset-link-sent/page.tsx"), /setInterval|setRemaining/);
});

test("invalid invitation and recovery routes retain the intended sign-in return action", () => {
  for (const page of [
    "app/admin/accept-invite/page.tsx",
    "app/admin/reset-password/page.tsx",
    "app/admin/reset-link-sent/page.tsx",
    "app/admin/access-pending/page.tsx",
  ]) {
    const content = source(page);
    assert.match(content, /backHref="\/admin" backLabel="Back to sign in"/, page);
  }
});

