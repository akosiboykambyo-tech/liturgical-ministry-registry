"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type Persona = "registry" | "cowl" | "curia";
type QaResult = { name: string; verdict: "PASS" | "FAIL" | "INCONCLUSIVE"; detail: string };

// Hardcoded QA identities; no real ministers' names, credentials, or private paths.
const QA_IDENTITIES: Record<string, Persona> = {
  "70bcf913-7695-481c-90ac-5d44f09dd4f8": "registry",
  "bf06a1c1-c086-4657-8145-317f09b32c7a": "cowl",
  "76992794-8f7f-45c3-a6b3-782ca6e64507": "curia",
};

// This one-pixel image is non-sensitive synthetic data and is permitted by the
// existing private bucket's image/png MIME allowlist.
const FIXTURE_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGOo1HQDAAIHAOm0L5ezAAAAAElFTkSuQmCC";
const TEST_URL = "https://rtptybxugjhvpfjvcvgw.supabase.co";
const BUCKET = "member-documents";
const FIXTURE = "release-qa/synthetic-private-access-v1.png";
const DENIED_PATHS = [
  "release-qa/finance-cowl-denied-v1.png",
  "release-qa/finance-curia-denied-v1.png",
];
const FILE_BYTES = Uint8Array.from(atob(FIXTURE_BASE64), char => char.charCodeAt(0));
const sameBytes = async (data: Blob): Promise<boolean> => {
  const actual = new Uint8Array(await data.arrayBuffer());
  return actual.length === FILE_BYTES.length && actual.every((value, i) => value === FILE_BYTES[i]);
};

export default function StorageTransferQa() {
  const { user, session, loading } = useAuth();
  const [running, setRunning] = useState(false);
  const [outcomes, setOutcomes] = useState<QaResult[]>([]);
  const [finished, setFinished] = useState(false);
  const [mode, setMode] = useState<"transfer" | "cleanup">("transfer");
  const persona = user?.id ? QA_IDENTITIES[user.id] : undefined;

  const add = (rows: QaResult[], name: string, verdict: QaResult["verdict"], detail: string) =>
    rows.push({ name, verdict, detail });

  async function runTransfer() {
    if (running || !session?.access_token || !user?.id || !persona) return;
    setRunning(true);
    setMode("transfer");
    setFinished(false);
    const rows: QaResult[] = [];
    const client = getSupabaseBrowserClient();
    const bucket = client.storage.from(BUCKET);
    try {
      const identity = await client.auth.getUser(session.access_token);
      if (identity.error || identity.data.user?.id !== user.id || identity.data.user.is_anonymous) {
        add(rows, "Live TEST identity", "FAIL", "The session could not be independently verified.");
        setOutcomes(rows);
        return;
      }
      add(rows, "Live TEST identity", "PASS", "Verified with TEST Auth.");

      if (persona === "registry") {
        const upload = await bucket.upload(FIXTURE, new Blob([FILE_BYTES], { type: "image/png" }), {
          contentType: "image/png", cacheControl: "0", upsert: false,
        });
        const alreadyPresent = upload.error &&
          (String(upload.error.statusCode) === "409" || /already exists|duplicate/i.test(upload.error.message));
        if (upload.error && !alreadyPresent) {
          add(rows, "Administrator private fixture upload", "FAIL",
            "TEST Storage rejected the isolated synthetic image upload.");
        } else {
          const data = await bucket.download(FIXTURE);
          const match = !data.error && data.data && await sameBytes(data.data);
          add(rows, "Administrator private upload and byte download",
            match ? "PASS" : "FAIL",
            match ? "Synthetic image was stored and downloaded byte-for-byte." :
              "Fixture missing or downloaded bytes differed; no real letter was accessed.");

          if (match) {
            const signed = await bucket.createSignedUrl(FIXTURE, 15);
            let signedOkay = false;
            if (!signed.error && signed.data?.signedUrl) {
              const url = new URL(signed.data.signedUrl, TEST_URL);
              if (url.origin === TEST_URL) {
                const response = await fetch(url.toString(), { cache: "no-store" });
                signedOkay = response.ok && await sameBytes(await response.blob());
              }
            }
            add(rows, "Administrator 15-second private signed URL", signedOkay ? "PASS" : "FAIL",
              signedOkay ? "Time-limited link returned correct synthetic bytes without exposing the link." :
                "Signed-link retrieval failed or returned incorrect data.");
          } else {
            add(rows, "Administrator 15-second private signed URL", "INCONCLUSIVE",
              "Skipped because the fixture download did not match.");
          }
        }
      } else {
        // Run AFTER Registry's positive test so that a missing object cannot
        // be mistaken for an authorization denial.
        const download = await bucket.download(FIXTURE);
        add(rows, "Finance private-file download denied",
          download.error && !download.data ? "PASS" : "FAIL",
          download.error ? "No private file bytes were returned." :
            "SECURITY FAILURE: finance user received the private synthetic file.");

        const signed = await bucket.createSignedUrl(FIXTURE, 15);
        add(rows, "Finance private signed-URL creation denied",
          signed.error && !signed.data ? "PASS" : "FAIL",
          signed.error ? "No signed private download link was issued." :
            "SECURITY FAILURE: finance user received a signed private download link.");

        const upload = await bucket.upload(DENIED_PATHS[persona === "cowl" ? 0 : 1],
          new Blob([FILE_BYTES], { type: "image/png" }), {
            contentType: "image/png", cacheControl: "0", upsert: false,
          });
        add(rows, "Finance private-file upload denied",
          upload.error && !upload.data ? "PASS" : "FAIL",
          upload.error ? "The server rejected the unapproved private upload." :
            "SECURITY FAILURE: finance user uploaded a private test file; Registry must clean up.");
      }

      // A private bucket must not serve file bytes through the public endpoint,
      // even if an apparent public URL can be constructed by the SDK.
      const publicUrl = bucket.getPublicUrl(FIXTURE).data.publicUrl;
      const publicResponse = await fetch(publicUrl, { method: "GET", cache: "no-store" });
      add(rows, "Private bucket public-URL denial",
        !publicResponse.ok && [400, 401, 403, 404].includes(publicResponse.status) ? "PASS" : "FAIL",
        "Unauthenticated public endpoint returned HTTP " + publicResponse.status + ".");

      // A separate request with only a public anon key, never the signed-in
      // user's token. Cache disabled to avoid accidental cache-based false passes.
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
      if (!anonKey) {
        add(rows, "Anonymous authenticated-endpoint denial", "INCONCLUSIVE",
          "TEST public API key missing.");
      } else {
        const anonResponse = await fetch(
          TEST_URL + "/storage/v1/object/authenticated/" + BUCKET + "/" + FIXTURE, {
            method: "GET", cache: "no-store",
            headers: { apikey: anonKey, Authorization: "Bearer " + anonKey },
          });
        add(rows, "Anonymous authenticated-endpoint denial",
          !anonResponse.ok && [400, 401, 403, 404].includes(anonResponse.status) ? "PASS" : "FAIL",
          "Anonymous-key request returned HTTP " + anonResponse.status + ".");
      }
    } catch {
      add(rows, "TEST file transfer", "INCONCLUSIVE",
        "Network or Storage error interrupted the check; release remains blocked.");
    } finally {
      // Never retain Auth tokens, downloaded private bytes, or signed URLs in UI.
      setOutcomes(rows);
      setFinished(true);
      setRunning(false);
    }
  }

  async function cleanup() {
    if (running || persona !== "registry" || !session?.access_token || !user?.id) return;
    setRunning(true);
    setMode("cleanup");
    setFinished(false);
    const rows: QaResult[] = [];
    try {
      const client = getSupabaseBrowserClient();
      const identity = await client.auth.getUser(session.access_token);
      if (identity.error || identity.data.user?.id !== user.id || identity.data.user.is_anonymous) {
        add(rows, "Registry QA identity", "FAIL", "Administrator session is not verified.");
        setOutcomes(rows);
        return;
      }
      const storage = client.storage.from(BUCKET);
      const result = await storage.remove([FIXTURE, ...DENIED_PATHS]);
      const check = await storage.download(FIXTURE);
      const ok = !result.error && Boolean(check.error);
      add(rows, "Remove synthetic QA files", ok ? "PASS" : "FAIL",
        ok ? "Fixture and designated QA filenames removed; synthetic file no longer downloads." :
          "Could not confirm fixture cleanup; review TEST Storage manually.");
    } catch {
      add(rows, "Remove synthetic QA files", "INCONCLUSIVE",
        "Unable to confirm cleanup; review TEST Storage manually.");
    } finally {
      setOutcomes(rows);
      setFinished(true);
      setRunning(false);
    }
  }

  const output = [
    "COWL-DOK TEST private Storage byte-transfer QA",
    "Persona: " + (persona ?? "unverified"),
    "Operation: " + mode,
    "Checks: " + outcomes.filter(r => r.verdict === "PASS").length + "/" + outcomes.length + " passed",
    ...outcomes.map(r => r.verdict + ": " + r.name + " — " + r.detail),
    "Synthetic PNG only, TEST project only. No real recommendation letters, passwords, tokens, paths, or signed URLs.",
  ].join("\n");

  return (
    <section className="mt-8 border-t border-[#E6DADC] pt-6" aria-labelledby="storage-transfer-title">
      <h2 id="storage-transfer-title" className="text-xl font-semibold text-[#302428]">
        Private file transfer verification
      </h2>
      <p className="mt-2 text-sm leading-6 text-[#706167]">
        Test only a synthetic, one-pixel PNG in the TEST private bucket. First run as Registry,
        next as COWL and Curia, then return as Registry to remove the fixture. No ministry
        records or existing documents will be changed.
      </p>
      {!loading && persona && session && (
        <div className="mt-4 space-y-3">
          <button type="button" onClick={runTransfer} disabled={running}
            className="min-h-12 w-full bg-[#890022] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">
            {running ? "Checking TEST Storage…" :
              persona === "registry" ? "Create fixture and verify actual private download" :
              "Verify my private-file access is denied"}
          </button>
          {persona === "registry" && (
            <button type="button" disabled={running} onClick={cleanup}
              className="min-h-12 w-full border border-[#890022] px-4 py-3 text-sm font-semibold text-[#890022] disabled:opacity-50">
              Remove synthetic QA files (after all three roles)
            </button>
          )}
        </div>
      )}
      {!loading && !session && <p className="mt-3 text-sm">Sign in to TEST to run these checks.</p>}
      {!loading && session && !persona && <p className="mt-3 text-sm">This account is not assigned to the three-role QA cohort.</p>}
      {finished && (
        <div className="mt-5" aria-live="polite">
          <p className="text-sm font-semibold text-[#302428]">
            {outcomes.filter(r => r.verdict === "PASS").length}/{outcomes.length} passed
          </p>
          <ol className="mt-3 space-y-2">
            {outcomes.map((result, index) => (
              <li key={index} className="border border-[#E6DADC] bg-white p-3 text-sm">
                <strong className={result.verdict === "PASS" ? "text-[#0B5C5A]" : "text-[#92202A]"}>
                  {result.verdict}
                </strong>{" — "}{result.name}
                <p className="mt-1 text-[#706167]">{result.detail}</p>
              </li>
            ))}
          </ol>
          <button type="button" onClick={() => void navigator.clipboard.writeText(output)}
            className="mt-4 min-h-12 w-full border border-[#0B5C5A] px-4 py-3 font-semibold text-[#0B5C5A]">
            Copy private-file QA results without credentials
          </button>
        </div>
      )}
    </section>
  );
}
