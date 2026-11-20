"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  activeFinancialRoles,
  calculateFinanceAccess,
  type FinanceGrant,
  type FinanceWorkspace,
} from "@/lib/financial-stewardship/access-model";

type Verdict = "pass" | "fail" | "inconclusive";
type Check = { label: string; verdict: Verdict; detail: string };
type SessionResponse = { error?: string };

const RED = "#890022";
const TEST_HOST = "rtptybxugjhvpfjvcvgw.supabase.co";
const STATUS_STYLE: Record<Verdict, string> = {
  pass: "text-[#07574F] bg-[#EAF6F2] border-[#A6CFC5]",
  fail: "text-[#9A1E31] bg-[#FFF0F0] border-[#DBA5AC]",
  inconclusive: "text-[#705008] bg-[#FFF8E7] border-[#E3D1A5]",
};
const IDLE_LABEL = "Run all read-only checks";

export default function Rc1QaClient() {
  const { loading, user } = useAuth();
  const [running, setRunning] = useState(false);
  const [checks, setChecks] = useState<Check[]>([]);
  const [roleSummary, setRoleSummary] = useState<string>("");
  const [copyStatus, setCopyStatus] = useState("");

  const record = (items: Check[], label: string, verdict: Verdict, detail: string) => {
    items.push({ label, verdict, detail });
    setChecks([...items]);
  };

  const run = async () => {
    if (running) return;
    setRunning(true);
    setChecks([]);
    setRoleSummary("");
    setCopyStatus("");
    const items: Check[] = [];
    const add = (label: string, verdict: Verdict, detail: string) =>
      record(items, label, verdict, detail);

    try {
      // Defense in depth against a mistakenly mounted non-TEST client build.
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
      if (new URL(url).hostname !== TEST_HOST) {
        add("Environment isolation", "fail", "Not connected to the approved TEST database.");
        return;
      }
      add("Environment isolation", "pass", "Preview points to the approved TEST Supabase host.");

      const supabase = getSupabaseBrowserClient();
      const sessionResult = await supabase.auth.getSession();
      const token = sessionResult.data.session?.access_token;
      if (!token || sessionResult.error) {
        add("Signed-in session", "fail", "Sign in to RC1 TEST using an existing TEST-only account.");
        return;
      }
      const validated = await supabase.auth.getUser(token);
      if (validated.error || !validated.data.user || validated.data.user.is_anonymous) {
        add("Real JWT validation", "fail", "Supabase rejected the current signed-in session.");
        return;
      }
      add("Real JWT validation", "pass", "Supabase Auth verified this browser session. No token is stored in the report.");

      // This is an actual first-party HTTP request, independent of login UI redirects.
      const unauthed = await fetch("/api/financial-stewardship/access?workspace=all", {
        method: "GET", cache: "no-store",
      });
      add("HTTP request without Bearer token",
        unauthed.status === 401 ? "pass" : "fail",
        "Expected 401; received " + unauthed.status + ".");

      const grantsResult = await supabase.from("fs_staff_grants")
        .select("role_code,granted_at,expires_at,revoked_at")
        .eq("user_id", validated.data.user.id);
      if (grantsResult.error) {
        add("JWT-scoped finance grants", "fail",
          "Cannot read own grants under RLS (database code " + (grantsResult.error.code || "unknown") + ").");
        return;
      }
      const roles = activeFinancialRoles((grantsResult.data ?? []) as FinanceGrant[], Date.now());
      const expected = calculateFinanceAccess(roles);
      const hasWorkspace = expected.cowl.length > 0 || expected.curia.length > 0;
      setRoleSummary(roles.length ? roles.join(", ") : "No active finance role");
      add("JWT-scoped finance grants", "pass",
        roles.length + " active finance role(s) resolved from signed-user RLS.");

      async function accessCheck(label: string, query: string, shouldAllow: boolean) {
        const response = await fetch("/api/financial-stewardship/access?" + query, {
          method: "GET",
          headers: { Authorization: "Bearer " + token },
          cache: "no-store",
        });
        const wanted = shouldAllow ? 200 : 403;
        add(label, response.status === wanted ? "pass" : "fail",
          "Expected HTTP " + wanted + "; received " + response.status + ".");
      }

      await accessCheck("Finance workspace entry (signed JWT)", "workspace=all", hasWorkspace);
      for (const workspace of ["cowl", "curia"] as FinanceWorkspace[]) {
        await accessCheck(
          (workspace === "cowl" ? "COWL" : "Curia") + " inventory isolation (signed JWT)",
          "workspace=" + workspace + "&section=inventory",
          expected[workspace].includes("inventory")
        );
      }

      const registry = await supabase.rpc("registration_is_admin");
      if (registry.error || typeof registry.data !== "boolean") {
        add("Registry admin check (signed JWT)", "fail",
          "Registry role RPC failed; status " + (registry.error?.code ?? "unknown") + ".");
        return;
      }
      const registryAdmin = registry.data === true;
      add("Registry admin check (signed JWT)", "pass",
        registryAdmin ? "Existing Registry Administrator authorization confirmed." :
          "This account is not a Registry Administrator.");

      for (const row of [
        { label: "Registry members under RLS", table: "members" },
        { label: "Certificate settings under RLS", table: "system_settings" },
      ]) {
        const result = await (row.table === "members" ?
          supabase.from("members") : supabase.from("system_settings"))
          .select("id" === (row.table === "members") ? "id" : "key",
            { head: true, count: "exact" });
        if (result.error || result.count === null) {
          add(row.label, "fail", "Signed read failed (code " + (result.error?.code ?? "unknown") + ").");
        } else {
          const approved = registryAdmin ? result.count > 0 : result.count === 0;
          add(row.label, approved ? "pass" : "fail",
            "Visible row count: " + result.count + "; expected " +
              (registryAdmin ? "Registry-admin access" : "zero private rows") + ".");
        }
      }

      // Null/empty payloads cannot create or update a valid Registry record.
      // Only call privileged write RPCs when the actor is *not* an admin.
      if (!registryAdmin) {
        const probes = [
          {
            label: "Registry write RPC denies non-admin",
            exec: () => supabase.rpc("registry_admin_member_write_v1",
              { p_action: "create", p_data: {} }),
          },
          {
            label: "Registration intake RPC denies non-admin",
            exec: () => supabase.rpc("registration_intake_v1", {
              p_request: null, p_first: null, p_last: null, p_parish: null,
              p_ministries: null, p_year: null,
            }),
          },
          {
            label: "Review resolution RPC denies non-admin",
            exec: () => supabase.rpc("registration_resolve_review_v1",
              { p_review: null, p_action: null, p_note: null }),
          },
        ];
        for (const probe of probes) {
          const response = await probe.exec();
          const code = response.error?.code;
          add(probe.label, code === "42501" ? "pass" : "fail",
            code === "42501" ? "Permission denied (42501)." :
              "Expected permission denied (42501); received " + (code || "success") + ".");
        }
      } else {
        add("Unauthorized Registry write probes", "inconclusive",
          "Skipped for this authorized administrator to prevent persistent test writes.");
      }

      // Boolean false + missing IDs ensure these RPC requests cannot
      // acknowledge, assign, or create legitimate financial artifacts.
      const financeProbes = [
        {
          label: "Curia custody write guard",
          authorized: roles.includes("curia_receipt_custodian"),
          exec: () => supabase.rpc("fs_curia_assign_receipt_booklet", {
            p_booklet_id: null, p_cowl_custodian_id: null, p_handover_confirmed: false,
          }),
        },
        {
          label: "COWL custody write guard",
          authorized: roles.includes("cowl_receipt_issuer"),
          exec: () => supabase.rpc("fs_cowl_acknowledge_receipt_booklet", {
            p_booklet_id: null, p_physically_checked: false,
          }),
        },
      ];
      for (const probe of financeProbes) {
        const response = await probe.exec();
        const code = response.error?.code;
        const passed = probe.authorized ?
          Boolean(response.error && code !== "42501") : code === "42501";
        add(probe.label, passed ? "pass" : "fail",
          probe.authorized ?
            (passed ? "Authorized role reached input validation; no action was executed." :
              "Expected input-validation rejection; received " + (code || "success") + ".") :
            (passed ? "Permission denied (42501)." :
              "Expected 42501; received " + (code || "success") + "."));
      }

      // A private bucket may be empty. Empty results alone never prove RLS.
      for (const bucket of ["member-documents", "fs-private"]) {
        const result = await supabase.storage.from(bucket).list("", { limit: 1 });
        if (result.error) {
          const code = String((result.error as { statusCode?: string | number }).statusCode ?? "");
          const denied = code === "401" || code === "403";
          add(bucket + " Storage listing", denied ? "pass" : "inconclusive",
            denied ? "Direct listing explicitly denied." :
              "Storage returned an error; RLS denial could not be established.");
        } else if ((result.data ?? []).length > 0 && !registryAdmin) {
          add(bucket + " Storage listing", "fail",
            "A non-Registry actor could list at least one private bucket entry. Review immediately.");
        } else {
          add(bucket + " Storage listing", "inconclusive",
            "No unauthorized object was demonstrated; empty or authorized listing cannot prove private download denial.");
        }
      }
    } catch {
      add("QA execution", "fail", "A network, session, or unexpected client error interrupted the checks.");
    } finally {
      setRunning(false);
    }
  };

  const copyReport = async () => {
    const summary = [
      "COWL-DOK RC1 TEST — Signed-session QA (sanitized)",
      "No tokens, passwords, user IDs, emails or private records included.",
      "Active role codes: " + (roleSummary || "not resolved"),
      ...checks.map(c => "[" + c.verdict.toUpperCase() + "] " + c.label + ": " + c.detail),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(summary);
      setCopyStatus("Sanitized report copied. You can paste the results into the project discussion.");
    } catch {
      setCopyStatus("Browser blocked copying. You can report only the pass/fail totals instead.");
    }
  };

  const totals = {
    pass: checks.filter(c => c.verdict === "pass").length,
    fail: checks.filter(c => c.verdict === "fail").length,
    inconclusive: checks.filter(c => c.verdict === "inconclusive").length,
  };

  return (
    <main className="min-h-screen bg-[#FBF9F9] px-4 py-10 text-[#271C20] sm:px-8">
      <div className="mx-auto max-w-3xl">
        <div className="border-l-4 border-[#890022] pl-4">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#890022]">
            COWL-DOK · RC1 Preview Only
          </p>
          <h1 className="mt-2 font-serif text-3xl font-medium sm:text-4xl">
            Authenticated security QA
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#57434A]">
            Uses your existing TEST-only login to verify real API, RPC, and
            database authorization. Runs only read requests and deliberately
            invalid write requests. No records, grants, or credentials are
            created or transmitted to a reporting service.
          </p>
        </div>
        <section className="mt-7 border border-[#E6DADC] bg-white p-5 sm:p-7"
          aria-label="QA test controls">
          <p className="text-sm leading-6">
            {loading ? "Checking your session…" :
              user ? "TEST staff session detected. You may run the checks." :
                "No TEST staff session. Sign in to the RC1 Preview first, then return to this page."}
          </p>
          {!loading && !user && (
            <Link href="/admin"
              className="mt-4 inline-flex min-h-11 items-center font-semibold text-[#890022] underline focus-visible:outline-2 focus-visible:outline-offset-4">
              Go to TEST staff sign-in
            </Link>
          )}
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button type="button" disabled={running || loading || !user}
              onClick={() => { void run(); }}
              className="min-h-12 bg-[#890022] px-6 py-3 text-sm font-bold text-white hover:bg-[#70001B] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#890022] disabled:cursor-not-allowed disabled:opacity-50">
              {running ? "Checking authorization…" : IDLE_LABEL}
            </button>
            {checks.length > 0 && !running && (
              <button type="button" onClick={() => { void copyReport(); }}
                className="min-h-12 border border-[#890022] bg-white px-5 text-sm font-semibold text-[#890022] hover:bg-[#FAF0F2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#890022]">
                Copy sanitized results
              </button>
            )}
          </div>
          <p className="mt-4 text-xs leading-5 text-[#6E5A61]">
            Do not run on production, paste access tokens into chat, or interpret
            an empty Storage bucket as proof that private downloads are secure.
          </p>
          <p role="status" aria-live="polite" className="mt-3 text-sm text-[#07574F]">
            {copyStatus}
          </p>
        </section>
        {checks.length > 0 && (
          <section className="mt-6" aria-label="Authorization test results">
            <h2 className="text-xl font-semibold">Results</h2>
            <p className="mt-2 text-sm text-[#57434A]" role="status" aria-live="polite">
              {totals.pass} passed · {totals.fail} failed · {totals.inconclusive} not conclusive
            </p>
            {roleSummary && <p className="mt-2 text-xs text-[#57434A]">Active finance roles: {roleSummary}</p>}
            <ul className="mt-4 space-y-3">
              {checks.map((check, index) => (
                <li key={index} className="border border-[#E6DADC] bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{check.label}</span>
                    <span className={"border px-2 py-1 text-xs font-bold uppercase " +
                      STATUS_STYLE[check.verdict]}>{check.verdict}</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[#57434A]">{check.detail}</p>
                </li>
              ))}
            </ul>
          </section>
        )}
        <p className="mt-8 text-xs text-[#57434A]">
          QA page is restricted to the approved TEST preview; no new API route,
          database policy, sign-in method, or service-role permission was added.
        </p>
      </div>
    </main>
  );
}
