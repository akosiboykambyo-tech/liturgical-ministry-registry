"use client";

import { useState } from "react";
import Link from "next/link";
import StorageTransferQa from "./storage-transfer-qa";
import CertificatePersistenceQa from "./certificate-persistence-qa";
import NegativeAccessQa from "./negative-access-qa";
import { AdminAuthShell, authPrimaryButtonClass, authTitleClass } from "@/components/admin-auth-ui";
import { useAuth } from "@/lib/auth-context";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type Persona = "registry" | "cowl" | "curia";
type Result = { label: string; status: "PASS" | "FAIL" | "INCONCLUSIVE"; detail: string };

/** Only three intentionally provisioned, non-production QA identities may run this test. */
const TEST_PERSONAS: Record<string, Persona> = {
  "70bcf913-7695-481c-90ac-5d44f09dd4f8": "registry",
  "bf06a1c1-c086-4657-8145-317f09b32c7a": "cowl",
  "76992794-8f7f-45c3-a6b3-782ca6e64507": "curia",
};

export default function ReleaseQaClient() {
  const { loading, session, user } = useAuth();
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [persona, setPersona] = useState<Persona | null>(null);
  const [ran, setRan] = useState(false);

  const add = (items: Result[], label: string, passed: boolean, detail: string) => {
    items.push({ label, status: passed ? "PASS" : "FAIL", detail });
  };

  async function runChecks() {
    if (!session?.access_token || !user?.id || running) return;
    const expected = TEST_PERSONAS[user.id];
    setPersona(expected ?? null);
    setResults([]);
    setRan(false);
    if (!expected) {
      setResults([{ label: "Approved TEST identity", status: "FAIL", detail: "This account is not one of the three designated QA identities." }]);
      setRan(true);
      return;
    }

    setRunning(true);
    const items: Result[] = [];
    const token = session.access_token;
    const client = getSupabaseBrowserClient();
    try {
      const verified = await client.auth.getUser(token);
      add(items, "Signed Supabase identity", !verified.error && verified.data.user?.id === user.id, "Checked against TEST Auth, not browser metadata.");

      const admin = await client.rpc("registration_is_admin");
      add(items, "Registry administrator separation",
        !admin.error && admin.data === (expected === "registry"),
        "Only the Registry TEST account may be a Registry administrator.");

      const grant = await client.from("fs_staff_grants").select("role_code,granted_at,expires_at,revoked_at");
      const actualRoles = (grant.data ?? [])
        .filter(row => !row.revoked_at && Date.parse(row.granted_at) <= Date.now() &&
          (!row.expires_at || Date.parse(row.expires_at) > Date.now()))
        .map(row => row.role_code).sort();
      const expectedRoles = expected === "cowl"
        ? ["cowl_financial_workspace_viewer"]
        : expected === "curia" ? ["curia_financial_workspace_viewer"] : [];
      add(items, "Exclusive financial role grants",
        !grant.error && JSON.stringify(actualRoles) === JSON.stringify(expectedRoles),
        "Checks that no COWL, Curia, or other finance role was added unexpectedly.");

      const status = async (path: string, accessToken?: string): Promise<number> => {
        const reply = await fetch(path, {
          method: "GET",
          headers: accessToken ? { Authorization: "Bearer " + accessToken } : {},
          cache: "no-store",
        });
        return reply.status;
      };

      const financeAll = await status("/api/financial-stewardship/access?workspace=all", token);
      add(items, "Finance access discovery", financeAll === (expected === "registry" ? 403 : 200),
        "Server-side check using this signed-in TEST account.");

      const cowl = await status("/api/financial-stewardship/access?workspace=cowl&section=inventory", token);
      add(items, "COWL Inventory authorization", cowl === (expected === "cowl" ? 200 : 403),
        "Expected HTTP " + (expected === "cowl" ? "200" : "403") + ", received " + cowl + ".");

      const curia = await status("/api/financial-stewardship/access?workspace=curia&section=inventory", token);
      add(items, "Curia Inventory authorization", curia === (expected === "curia" ? 200 : 403),
        "Expected HTTP " + (expected === "curia" ? "200" : "403") + ", received " + curia + ".");

      const anonymous = await status("/api/financial-stewardship/access?workspace=all");
      add(items, "Anonymous API denial", anonymous === 401,
        "Expected HTTP 401, received " + anonymous + ".");

      // The unknown action is rejected before any write occurs. For an administrator
      // it must be a validation error (22023); for others permission denied (42501).
      const writer = await client.rpc("registry_admin_member_write_v1", {
        p_action: "__release_qa_invalid_noop__", p_data: {},
      });
      add(items, "Registry member-write authorization",
        writer.error?.code === (expected === "registry" ? "22023" : "42501"),
        "Uses a deliberately unsupported operation; no member write is attempted.");

      const verification = await client.rpc("registry_verify_ministries_v3", {
        p_member_id: null,
        p_membership_ids: [],
        p_status: "New",
        p_effective_date: null,
        p_reason: null,
      });
      add(items, "Ministry verification authorization",
        verification.error?.code === (expected === "registry" ? "22023" : "42501"),
        "Uses invalid inputs; no ministry approval is attempted.");

      for (const bucket of ["member-documents", "certificate-templates"]) {
        const listing = await client.storage.from(bucket).list("", { limit: 10 });
        const visible = listing.data?.length ?? 0;
        const denied = Boolean(listing.error && ["400", "401", "403"].includes(String(listing.error.statusCode)));
        const ok = expected === "registry"
          ? !listing.error && visible > 0
          : (!listing.error && visible === 0) || denied;
        add(items, bucket === "member-documents" ? "Private-letter Storage listing" : "Certificate Storage listing",
          ok,
          expected === "registry"
            ? "Only a count is tested; no file contents or object paths are displayed."
            : "No private object or bucket listing is revealed to this financial user.");
      }
    } catch {
      items.push({ label: "QA network execution", status: "INCONCLUSIVE",
        detail: "A network or authorization-service error interrupted the tests. Do not treat this as approval." });
    } finally {
      // Only outcomes are retained in React state. Never display, save, copy,
      // log or transmit the JWT, refresh token, password, email, or Storage paths.
      setResults(items);
      setRunning(false);
      setRan(true);
    }
  }

  const report = [
    "COWL-DOK TEST release verification",
    "Persona: " + (persona ?? "not authorized"),
    "Checks: " + results.filter(x => x.status === "PASS").length + "/" + results.length + " passed",
    ...results.map(x => x.status + ": " + x.label + " — " + x.detail),
    "Scope: TEST preview, signed-session read/denial checks only. Does not certify file bytes, print QA or disaster recovery.",
  ].join("\n");

  return (
    <AdminAuthShell backHref="/admin" backLabel="Back to staff sign in" showSupport>
      <h1 className={authTitleClass}>TEST security verification</h1>
      <p className="mt-3 text-sm leading-6 text-[#706167]">
        This page checks the current TEST account's permissions. It does not create, edit, approve,
        upload, or delete ministry data. Results contain no passwords or tokens.
      </p>
      {loading ? <p role="status" className="mt-6 text-sm">Checking your session…</p> :
        !session?.access_token || !user ? (
          <p className="mt-6 text-sm leading-6">Please <Link className="font-semibold text-[#0B5C5A] underline" href="/admin">sign in to TEST</Link> first, then return here.</p>
        ) : (
          <div className="mt-6 space-y-4">
            <p className="text-sm">Current QA role: <strong>{TEST_PERSONAS[user.id] ?? "not authorized for QA"}</strong></p>
            <button type="button" onClick={runChecks}
              disabled={running || !TEST_PERSONAS[user.id]} className={authPrimaryButtonClass}>
              {running ? "Running signed-session checks…" : "Run security checks"}
            </button>
          </div>
        )}
      {ran && (
        <section className="mt-7" aria-label="Security test results">
          <p aria-live="polite" className="font-semibold text-[#302428]">
            {results.filter(x => x.status === "PASS").length} of {results.length} checks passed
          </p>
          <ol className="mt-3 space-y-3">
            {results.map((item, index) => (
              <li key={index} className="border border-[#E6DADC] bg-white p-3 text-sm">
                <p className="font-semibold">
                  <span className={item.status === "PASS" ? "text-[#0B5C5A]" : "text-[#92202A]"}>
                    {item.status}
                  </span>{" — "}{item.label}
                </p>
                <p className="mt-1 text-[#706167]">{item.detail}</p>
              </li>
            ))}
          </ol>
          <button type="button" onClick={() => void navigator.clipboard.writeText(report)}
            className="mt-4 w-full border border-[#0B5C5A] p-3 font-semibold text-[#0B5C5A] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B5C5A]">
            Copy results without credentials
          </button>
          <p className="mt-3 text-xs leading-5 text-[#706167]">
            These checks do not certify actual private-file downloads, revoked-user browser sessions,
            certificate printing, or the recovery drill. They are separate release gates.
          </p>
        </section>
      )}
      <StorageTransferQa />
      <CertificatePersistenceQa />
      <NegativeAccessQa />
    </AdminAuthShell>
  );
}
