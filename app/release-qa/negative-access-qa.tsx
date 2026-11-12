"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type Phase = "unassigned" | "granted" | "revoked";
type Verdict = "PASS" | "FAIL" | "INCONCLUSIVE";
type Row = { name: string; verdict: Verdict; detail: string };
type Grant = { role_code: string; granted_at: string; expires_at: string | null; revoked_at: string | null };

/** Existing TEST staff must never be repurposed as a negative-access QA identity. */
const EXISTING_TEST_STAFF = new Set([
  "24bca0f6-e6ff-498c-9c74-7e6687898f68",
  "2aa8a511-52b9-451c-a8d5-c8e5726f232f",
  "70bcf913-7695-481c-90ac-5d44f09dd4f8",
  "bf06a1c1-c086-4657-8145-317f09b32c7a",
  "76992794-8f7f-45c3-a6b3-782ca6e64507",
]);

const add = (rows: Row[], name: string, ok: boolean, detail: string) => {
  rows.push({ name, verdict: ok ? "PASS" : "FAIL", detail });
};

export default function NegativeAccessQa() {
  const { session, user, loading } = useAuth();
  const [phase, setPhase] = useState<Phase>("unassigned");
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [results, setResults] = useState<Row[]>([]);
  const [completedPhase, setCompletedPhase] = useState<Phase>("unassigned");
  const eligible = !!user && !EXISTING_TEST_STAFF.has(user.id);

  async function runCheck() {
    if (running || !eligible || !user || !session?.access_token) return;
    setRunning(true);
    setFinished(false);
    setResults([]);
    setCompletedPhase(phase);
    const rows: Row[] = [];
    const client = getSupabaseBrowserClient();
    const token = session.access_token;
    try {
      const verified = await client.auth.getUser(token);
      const signedIn = !verified.error && verified.data.user?.id === user.id &&
        !verified.data.user.is_anonymous;
      add(rows, "Signed TEST Auth identity", signedIn,
        "TEST Auth independently validates this dedicated account.");
      if (!signedIn) return;

      const grantResult = await client.from("fs_staff_grants")
        .select("role_code,granted_at,expires_at,revoked_at").eq("user_id", user.id);
      const grants = (grantResult.data ?? []) as Grant[];
      const now = Date.now();
      const active = grants.filter(g => !g.revoked_at &&
        Date.parse(g.granted_at) <= now &&
        (!g.expires_at || Date.parse(g.expires_at) > now));
      const previouslyRevoked = grants.filter(g => g.revoked_at &&
        g.role_code === "cowl_financial_workspace_viewer");
      const expectedGrants = phase === "unassigned"
        ? grants.length === 0
        : phase === "granted"
          ? active.length === 1 && active[0].role_code === "cowl_financial_workspace_viewer"
          : active.length === 0 && previouslyRevoked.length >= 1;
      add(rows, "Live role-grant state matches the selected phase",
        !grantResult.error && expectedGrants,
        phase === "unassigned"
          ? "This account must have no grant history."
          : phase === "granted"
            ? "Exactly one active COWL-only viewer grant is required."
            : "At least one revoked COWL viewer grant and zero active grants are required.");

      const admin = await client.rpc("registration_is_admin");
      add(rows, "No Registry administrator permission",
        !admin.error && admin.data === false,
        "The dedicated account must not acquire the Registry administrator allowlist.");

      const getStatus = async (path: string) => {
        const response = await fetch(path, {
          method: "GET",
          headers: { Authorization: "Bearer " + token },
          cache: "no-store",
        });
        return response.status;
      };
      const access = await getStatus("/api/financial-stewardship/access?workspace=all");
      const cowl = await getStatus("/api/financial-stewardship/access?workspace=cowl&section=inventory");
      const curia = await getStatus("/api/financial-stewardship/access?workspace=curia&section=inventory");
      const expectedAllowed = phase === "granted";
      add(rows, "Live finance access API", access === (expectedAllowed ? 200 : 403),
        "Expected HTTP " + (expectedAllowed ? 200 : 403) + ", received " + access + ".");
      add(rows, "Live COWL inventory API", cowl === (expectedAllowed ? 200 : 403),
        "Expected HTTP " + (expectedAllowed ? 200 : 403) + ", received " + cowl + ".");
      add(rows, "Live Curia inventory denied", curia === 403,
        "Expected HTTP 403, received " + curia + ".");

      const writer = await client.rpc("registry_admin_member_write_v1", {
        p_action: "__release_qa_invalid_noop__", p_data: {},
      });
      add(rows, "Registry member writer denied", writer.error?.code === "42501",
        "An unsupported action must be rejected for lack of administrator permission.");
      const verify = await client.rpc("registry_verify_ministries_v3", {
        p_member_id: null, p_membership_ids: [], p_status: "New",
        p_effective_date: null, p_reason: null,
      });
      add(rows, "Ministry verification denied", verify.error?.code === "42501",
        "Invalid verification inputs must be rejected before any approval.");

      const files = await client.storage.from("member-documents").list("", { limit: 10 });
      const hidden = (!files.error && (files.data?.length ?? 0) === 0) ||
        (files.error && ["400", "401", "403"].includes(String(files.error.statusCode)));
      add(rows, "Private Registry letters not listable", !!hidden,
        "No private member-document listing may be exposed.");

      // A denied INSERT on an isolated synthetic settings key tests certificate
      // permissions. No existing template key is touched or overwritten.
      const key = "certificate_template_releaseqa_" +
        user.id.replace(/-/g, "").slice(0, 16);
      const write = await client.from("system_settings").insert({
        key, value: { release_qa: true, negative_access_check: true },
        is_default: false,
      }).select("key").maybeSingle();
      const denied = !!write.error && write.error.code === "42501" && !write.data;
      add(rows, "Certificate settings write denied", denied,
        denied ? "RLS blocked the synthetic settings INSERT." :
          "Unexpected settings response. STOP release and inspect the isolated QA key.");

      if (!denied && write.data?.key === key) {
        // Best-effort narrowly scoped cleanup after unexpected exposure. Do not
        // claim success or silently hide this authorization failure.
        const removed = await client.from("system_settings")
          .delete().eq("key", key).select("key").maybeSingle();
        add(rows, "Unexpected synthetic settings cleanup",
          !removed.error && removed.data?.key === key,
          "If cleanup failed, a TEST administrator must inspect only this QA key.");
      }
    } catch {
      rows.push({
        name: "Negative-account network checks", verdict: "INCONCLUSIVE",
        detail: "The TEST request was interrupted; do not certify this phase.",
      });
    } finally {
      // Display only counts, HTTP status, and names of checks; never credentials,
      // JWTs, account email, private object paths, or signed file URLs.
      setResults(rows);
      setFinished(true);
      setRunning(false);
    }
  }

  const report = [
    "COWL-DOK TEST negative-account authorization QA",
    "Phase: " + completedPhase,
    "Checks: " + results.filter(x => x.verdict === "PASS").length + "/" + results.length + " passed",
    ...results.map(x => x.verdict + ": " + x.name + " — " + x.detail),
    "Dedicated TEST account only. No existing staff grant was changed by this page.",
  ].join("\n");

  return (
    <section className="mt-8 border-t border-[#E6DADC] pt-6" aria-labelledby="negative-qa-title">
      <h2 id="negative-qa-title" className="text-xl font-semibold text-[#302428]">
        Unassigned and revoked account verification
      </h2>
      <p className="mt-2 text-sm leading-6 text-[#706167]">
        This is for a new, dedicated TEST Auth account only. It compares a real
        signed-in session with current database permissions before authorization,
        while temporarily granted COWL viewing access, and after that grant is
        revoked. This page does not change grants.
      </p>
      {!loading && session && !eligible && (
        <p className="mt-3 text-sm text-[#706167]">
          Sign in with a separate TEST-only account that is not one of the five existing staff.
          No existing account will be reassigned.
        </p>
      )}
      {!loading && !session && (
        <p className="mt-3 text-sm text-[#706167]">
          Sign in with the dedicated TEST-only account to run these checks.
        </p>
      )}
      {!loading && session && eligible && (
        <div className="mt-4 space-y-3">
          <label htmlFor="negative-qa-phase" className="block text-sm font-semibold text-[#302428]">
            Current server-side grant phase
          </label>
          <select id="negative-qa-phase" value={phase}
            onChange={e => { setPhase(e.target.value as Phase); setFinished(false); }}
            disabled={running}
            className="min-h-12 w-full border border-[#CDBFC3] bg-white px-3 text-base text-[#302428] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#890022]">
            <option value="unassigned">1. Unassigned — no role grants</option>
            <option value="granted">2. Granted — COWL viewer only</option>
            <option value="revoked">3. Revoked — no active grants</option>
          </select>
          <button type="button" disabled={running} onClick={runCheck}
            className="min-h-12 w-full bg-[#890022] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2">
            {running ? "Checking live TEST permissions…" : "Run selected negative-access checks"}
          </button>
          <p className="text-xs leading-5 text-[#706167]">
            Phase 2 and 3 only make sense after an operator changes the dedicated
            TEST account's grant. Changing this selector does not grant or revoke access.
          </p>
        </div>
      )}
      {finished && (
        <div className="mt-5" aria-live="polite">
          <p className="font-semibold text-[#302428]">
            {results.filter(x => x.verdict === "PASS").length}/{results.length} checks passed
          </p>
          <ol className="mt-3 space-y-2">
            {results.map((result, i) => (
              <li key={i} className="border border-[#E6DADC] bg-white p-3 text-sm">
                <strong className={result.verdict === "PASS" ? "text-[#0B5C5A]" : "text-[#92202A]"}>
                  {result.verdict}
                </strong>{" — "}{result.name}
                <p className="mt-1 text-[#706167]">{result.detail}</p>
              </li>
            ))}
          </ol>
          <button type="button" onClick={() => void navigator.clipboard.writeText(report)}
            className="mt-4 min-h-12 w-full border border-[#0B5C5A] px-4 py-3 font-semibold text-[#0B5C5A] focus-visible:outline-2 focus-visible:outline-offset-2">
            Copy negative-account QA results without credentials
          </button>
        </div>
      )}
    </section>
  );
}
