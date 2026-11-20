const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const source = fs.readFileSync(path.join(__dirname, "../lib/auth-invitation-challenge.ts"), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2018 },
}).outputText;
const mod = { exports: {} };
new Function("module", "exports", output)(mod, mod.exports);
const { parseInviteChallenge } = mod.exports;
const token = "a".repeat(64);

test("only valid invitation tokens are accepted for subsequent Supabase verification", () => {
  assert.equal(parseInviteChallenge("https://www.cowl-dok.online/admin/accept-invite?token_hash=" + token + "&type=invite"), token);
  assert.equal(parseInviteChallenge("https://www.cowl-dok.online/admin/accept-invite#token_hash=" + token + "&type=invite"), token);
});

test("an ordinary session, recovery link, or malformed invite cannot initiate first-time password setup", () => {
  assert.equal(parseInviteChallenge("https://www.cowl-dok.online/admin/accept-invite"), null);
  assert.equal(parseInviteChallenge("https://www.cowl-dok.online/admin/accept-invite?type=recovery&token_hash=" + token), null);
  assert.equal(parseInviteChallenge("https://www.cowl-dok.online/admin/accept-invite?type=invite&token_hash=bad"), null);
  assert.equal(parseInviteChallenge("https://www.cowl-dok.online/admin/accept-invite?type=invite"), null);
});

test("conflicting query and fragment tokens or types are rejected", () => {
  assert.equal(parseInviteChallenge("https://www.cowl-dok.online/admin/accept-invite?type=invite&token_hash=" + token + "#type=recovery"), null);
  assert.equal(parseInviteChallenge("https://www.cowl-dok.online/admin/accept-invite?type=invite&token_hash=" + token + "#token_hash=" + "b".repeat(64)), null);
});

test("branded invitation and recovery templates use verified first-party routes", () => {
  const invite = fs.readFileSync(path.join(__dirname, "../emails/supabase-invite.html"), "utf8");
  const recovery = fs.readFileSync(path.join(__dirname, "../emails/supabase-recovery.html"), "utf8");
  assert.match(invite, /\/admin\/accept-invite\?token_hash=\{\{ \.TokenHash \}\}&amp;type=invite/);
  assert.match(recovery, /\/admin\/reset-password\?token_hash=\{\{ \.TokenHash \}\}&amp;type=recovery/);
  assert.match(invite, /COWL-DOK Portal/);
  assert.match(recovery, /COWL-DOK Portal/);
});

test("password creation and recovery require Supabase Auth verification before updateUser", () => {
  const invitation = fs.readFileSync(path.join(__dirname, "../app/admin/accept-invite/page.tsx"), "utf8");
  const recovery = fs.readFileSync(path.join(__dirname, "../app/admin/reset-password/page.tsx"), "utf8");
  assert.match(invitation, /auth\.verifyOtp/);
  assert.match(invitation, /type: "invite"/);
  assert.match(invitation, /verifiedUser\.current/);
  assert.match(recovery, /auth\.verifyOtp/);
  assert.match(recovery, /type: "recovery"/);
  assert.doesNotMatch(recovery, /recoveryUrl\s*\|\|/);
});
