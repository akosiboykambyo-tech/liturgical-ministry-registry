"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type QaRole = "registry" | "cowl" | "curia";
type Result = { label: string; status: "PASS" | "FAIL" | "INCONCLUSIVE"; detail: string };

// This component is rendered only by the server-side TEST Supabase preview gate.
const QA_IDENTITIES: Record<string, QaRole> = {
  "70bcf913-7695-481c-90ac-5d44f09dd4f8": "registry",
  "bf06a1c1-c086-4657-8145-317f09b32c7a": "cowl",
  "76992794-8f7f-45c3-a6b3-782ca6e64507": "curia",
};
const PREFIX = "certificate_template_releaseqa_";

export default function CertificatePersistenceQa() {
  const { session, user, loading } = useAuth();
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [completed, setCompleted] = useState(false);
  const persona = user?.id ? QA_IDENTITIES[user.id] : undefined;
  const append = (list: Result[], label: string, passed: boolean, detail: string) => {
    list.push({ label, status: passed ? "PASS" : "FAIL", detail });
  };

  const run = async () => {
    if (running || !persona || !user?.id || !session?.access_token) return;
    setRunning(true);
    setCompleted(false);
    const rows: Result[] = [];
    const client = getSupabaseBrowserClient();
    // system_settings.key is varchar(50). Prefix (31) + 16 UUID hex = 47.
    // Do not use the full 32-char UUID: the previous 63-char key failed with SQLSTATE 22001.
    const key = PREFIX + user.id.replace(/-/g, "").slice(0, 16);
    let created = false;
    let safeToAttempt = false;
    try {
      const verified = await client.auth.getUser(session.access_token);
      safeToAttempt = !verified.error && verified.data.user?.id === user.id &&
        !verified.data.user.is_anonymous;
      append(rows, "TEST signed identity", safeToAttempt,
        "Confirmed with the TEST Auth server before testing a synthetic certificate key.");
      if (!safeToAttempt) return;

      const original = await client.from("system_settings")
        .select("key,is_default").like("key", "certificate_template%");
      const originalDefault = original.data?.filter(item => item.is_default).map(item => item.key) ?? [];
      const originalKeys = (original.data ?? []).map(item => item.key).sort();
      const validBaseline = !original.error && originalKeys.length === 2 &&
        originalDefault.length === 1 && originalDefault[0] === "certificate_template_2027-renewal" &&
        !originalKeys.includes(key);
      append(rows, "Original certificate template inventory", validBaseline,
        "Expect exactly the two restored TEST templates, with the 2027 renewal design as default.");
      if (!validBaseline) return;

      if (persona === "registry") {
        // Use INSERT, never UPSERT: no existing design or default can be overwritten.
        const insert = await client.from("system_settings").insert({
          key, value: { release_qa: true, version: 1 }, is_default: false,
        }).select("key").maybeSingle();
        created = !insert.error && insert.data?.key === key;
        append(rows, "Create isolated TEST-only certificate record", created,
          created ? "Only a new synthetic, non-default settings record was created." :
            "The synthetic INSERT did not persist (database error code: " +
              (insert.error?.code ?? "none") + "). Existing templates untouched.");
        if (!created) return;

        const saved = await client.from("system_settings")
          .update({ value: { release_qa: true, version: 2 } })
          .eq("key", key).select("key").maybeSingle();
        append(rows, "Save synthetic certificate changes",
          !saved.error && saved.data?.key === key,
          "A confirmed server-returned row is required before reporting success.");

        // A separate SELECT verifies what the database returns after the UPDATE.
        const reloaded = await client.from("system_settings")
          .select("key,value,is_default").eq("key", key).maybeSingle();
        const matching = !reloaded.error && reloaded.data?.key === key &&
          reloaded.data?.value?.release_qa === true &&
          reloaded.data?.value?.version === 2 && reloaded.data?.is_default === false;
        append(rows, "Reload persisted certificate record", matching,
          "The isolated TEST database returned version 2 with default=false.");
      } else {
        const denied = await client.from("system_settings").insert({
          key, value: { release_qa: true, version: 1 }, is_default: false,
        }).select("key").maybeSingle();
        const denial = !!denied.error && !denied.data &&
          ["42501", "PGRST301"].includes(String(denied.error.code));
        append(rows, "Finance certificate settings write denied", denial,
          denial ? "Database rejected the synthetic INSERT for this financial role." :
            "Unexpected result. Stop release and investigate certificate RLS and any QA-only key.");
      }
    } catch {
      rows.push({ label: "Certificate persistence network check", status: "INCONCLUSIVE",
        detail: "Unexpected network/database response; do not certify." });
    } finally {
      // Cleanup is exact-key and never changes either existing default/real certificate.
      if (persona === "registry" && created) {
        try {
          const deletion = await client.from("system_settings")
            .delete().eq("key", key).select("key").maybeSingle();
          const lookup = await client.from("system_settings")
            .select("key").eq("key", key).maybeSingle();
          append(rows, "Remove isolated TEST certificate record",
            !deletion.error && deletion.data?.key === key && !lookup.error && lookup.data === null,
            "Cleanup deletes only the synthetic QA key and independently checks it is absent.");
        } catch {
          rows.push({ label: "Remove isolated TEST certificate record", status: "INCONCLUSIVE",
            detail: "Cannot confirm cleanup; an administrator must inspect only the QA key." });
        }
      }
      if (safeToAttempt) {
        try {
          const after = await client.from("system_settings")
            .select("key,is_default").like("key", "certificate_template%");
          const originals = after.data?.filter(item => !item.key.startsWith(PREFIX)) ?? [];
          const noUnexpected = after.data?.every(item => !item.key.startsWith(PREFIX)) ?? false;
          append(rows, "Original templates and default preserved",
            !after.error && originals.length === 2 &&
              originals.filter(item => item.is_default).map(item => item.key)[0] ===
                "certificate_template_2027-renewal" && noUnexpected,
            "The two original templates must remain, and no synthetic keys may persist.");
        } catch {
          rows.push({ label: "Original templates and default preserved",
            status: "INCONCLUSIVE", detail: "Could not verify after-state; check TEST database." });
        }
      }
      setResults(rows);
      setCompleted(true);
      setRunning(false);
    }
  };

  const report = [
    "COWL-DOK TEST Certificate Studio persistence QA",
    "Persona: " + (persona ?? "unverified"),
    "Checks: " + results.filter(item => item.status === "PASS").length +
      "/" + results.length + " passed",
    ...results.map(item => item.status + ": " + item.label + " — " + item.detail),
    "Scope: synthetic non-default TEST database record only; no real template artwork, members or signatories changed.",
    "Certificate Studio full-resolution visual preview, QR/font/signature/print and recovery still require separate QA.",
  ].join("\n");

  return (
    <section className="mt-8 border-t border-[#E6DADC] pt-6" aria-labelledby="certificate-qa-title">
      <h2 id="certificate-qa-title" className="text-xl font-semibold text-[#302428]">
        Certificate Studio persistence verification
      </h2>
      <p className="mt-2 text-sm leading-6 text-[#706167]">
        This uses the current TEST account to confirm database save, reload and access permissions.
        The Registry test uses one synthetic, non-default record and removes it automatically.
        It does not change either saved certificate design or any signatory.
      </p>
      {!loading && persona && session && (
        <button type="button" disabled={running} onClick={run}
          className="mt-4 min-h-12 w-full bg-[#890022] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2">
          {running ? "Checking TEST certificate persistence…" :
            persona === "registry" ? "Test certificate save, reload and cleanup" :
              "Verify certificate changes are denied"}
        </button>
      )}
      {!loading && !session && <p className="mt-3 text-sm">Sign in to TEST to run this check.</p>}
      {!loading && session && !persona && (
        <p className="mt-3 text-sm">This account is outside the approved QA cohort.</p>
      )}
      {completed && (
        <div className="mt-5" aria-live="polite">
          <p className="font-semibold text-[#302428]">
            {results.filter(item => item.status === "PASS").length}/{results.length} checks passed
          </p>
          <ol className="mt-3 space-y-2">
            {results.map((result, index) => (
              <li key={index} className="border border-[#E6DADC] bg-white p-3 text-sm">
                <strong className={result.status === "PASS" ? "text-[#0B5C5A]" : "text-[#92202A]"}>
                  {result.status}
                </strong>{" — "}{result.label}
                <p className="mt-1 text-[#706167]">{result.detail}</p>
              </li>
            ))}
          </ol>
          <button type="button" onClick={() => void navigator.clipboard.writeText(report)}
            className="mt-4 min-h-12 w-full border border-[#0B5C5A] px-4 py-3 font-semibold text-[#0B5C5A] focus-visible:outline-2 focus-visible:outline-offset-2">
            Copy certificate QA report without credentials
          </button>
        </div>
      )}
      {persona === "registry" && (
        <p className="mt-4 text-sm leading-6 text-[#706167]">
          For the separate visual and printing check, open{" "}
          <Link href="/admin/certificates" className="font-semibold text-[#0B5C5A] underline">
            Certificate Studio
          </Link>{" "}
          and inspect the existing renewal designs, fonts, QR, signatories and full-resolution
          print preview without saving changes to real templates.
        </p>
      )}
    </section>
  );
}
