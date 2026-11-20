"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { useAuth } from "@/lib/auth-context";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type Verdict = "pass" | "fail" | "inconclusive";
type Check = { label: string; verdict: Verdict; detail: string };
type Fixture = { path: string; createdAt: number };
const BUCKET = "member-documents";
const TEST_HOST = "rtptybxugjhvpfjvcvgw.supabase.co";
const STORAGE_KEY = "cowl-dok:rc1:storage-qa:fixture:v1";
const PATH_PATTERN = /^rc1-security-qa\/[a-f0-9-]{36}\.png$/i;
const PNG_1PX =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/TZkAAAAASUVORK5CYII=";

const classes: Record<Verdict, string> = {
  pass: "border-[#A6CFC5] bg-[#EAF6F2] text-[#07574F]",
  fail: "border-[#DBA5AC] bg-[#FFF0F0] text-[#9A1E31]",
  inconclusive: "border-[#E3D1A5] bg-[#FFF8E7] text-[#705008]",
};

function fixtureBytes(): Uint8Array {
  const binary = atob(PNG_1PX);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function matchesFixture(blob: Blob): Promise<boolean> {
  const actual = new Uint8Array(await blob.arrayBuffer());
  const expected = fixtureBytes();
  return actual.length === expected.length && actual.every((item, i) => item === expected[i]);
}

function storedFixture(): Fixture | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const item = JSON.parse(raw) as Partial<Fixture>;
    if (typeof item.path !== "string" || !PATH_PATTERN.test(item.path) ||
        typeof item.createdAt !== "number" || !Number.isFinite(item.createdAt)) return null;
    return { path: item.path, createdAt: item.createdAt };
  } catch {
    return null;
  }
}

function isTestPreviewClient(): boolean {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname === TEST_HOST;
  } catch {
    return false;
  }
}

function isAccessDenied(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { statusCode?: number | string; status?: number | string };
  const status = String(value.statusCode ?? value.status ?? "");
  // Unauthorized private Storage objects may be concealed as 400/404.
  // A known synthetic, positively verified object is the control.
  return ["400", "401", "403", "404"].includes(status);
}

async function validateIdentity(client: SupabaseClient): Promise<boolean> {
  const session = await client.auth.getSession();
  if (session.error || !session.data.session?.access_token) return false;
  const result = await client.auth.getUser(session.data.session.access_token);
  return !result.error && Boolean(result.data.user && !result.data.user.is_anonymous);
}

export default function StorageQaClient() {
  const { user, loading } = useAuth();
  const [fixture, setFixture] = useState<Fixture | null>(null);
  const [busy, setBusy] = useState(false);
  const [checks, setChecks] = useState<Check[]>([]);
  const [status, setStatus] = useState("");

  useEffect(() => { setFixture(storedFixture()); }, [user?.id]);

  const append = (next: Check[]) => setChecks([...next]);
  const addCheck = (next: Check[], label: string, verdict: Verdict, detail: string) => {
    next.push({ label, verdict, detail });
    append(next);
  };

  async function registryAdmin(): Promise<boolean | null> {
    const supabase = getSupabaseBrowserClient();
    if (!(await validateIdentity(supabase))) return null;
    const result = await supabase.rpc("registration_is_admin");
    return result.error || typeof result.data !== "boolean" ? null : result.data;
  }

  const createFixture = async () => {
    if (busy || !user) return;
    setBusy(true);
    setStatus("");
    setChecks([]);
    try {
      if (!isTestPreviewClient()) {
        setStatus("Blocked: this is not the approved TEST database.");
        return;
      }
      const isAdmin = await registryAdmin();
      if (isAdmin !== true) {
        setStatus(isAdmin === null ? "Cannot validate a signed-in Registry Administrator." :
          "Only a TEST Registry Administrator can create this fixture.");
        return;
      }
      if (storedFixture()) {
        setStatus("A fixture already exists in this browser. Complete the test and remove it first.");
        return;
      }

      const path = "rc1-security-qa/" + crypto.randomUUID() + ".png";
      const bytes = fixtureBytes();
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "image/png" });
      const supabase = getSupabaseBrowserClient();
      const uploaded = await supabase.storage.from(BUCKET).upload(path, blob, {
        cacheControl: "0", contentType: "image/png", upsert: false,
      });
      if (uploaded.error) {
        setStatus("Fixture upload failed. No authorization result is claimed; check TEST Storage policy.");
        return;
      }

      // Save the safe, synthetic path immediately so a failed verification
      // does not orphan a successfully uploaded object.
      const next = { path, createdAt: Date.now() };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setFixture(next);
      const read = await supabase.storage.from(BUCKET).download(path);
      if (read.error || !read.data || !(await matchesFixture(read.data))) {
        setStatus("Uploaded synthetic object, but authorized download did not verify. Keep this tab and use Remove fixture.");
        return;
      }
      const signed = await supabase.storage.from(BUCKET).createSignedUrl(path, 60);
      if (signed.error || !signed.data?.signedUrl) {
        setStatus("Authorized direct download passed, but signed-URL creation failed. Use Remove fixture after testing.");
        return;
      }
      setStatus("Synthetic PNG created. Registry Administrator direct download and short-lived signed URL creation PASSED. You can switch TEST accounts.");
    } catch {
      setStatus("Fixture setup interrupted. If a fixture is shown, remove it with the TEST Registry Administrator.");
    } finally {
      setBusy(false);
    }
  };

  const runChecks = async () => {
    if (busy || !user) return;
    setBusy(true);
    setChecks([]);
    setStatus("");
    const next: Check[] = [];
    const check = (label: string, verdict: Verdict, detail: string) =>
      addCheck(next, label, verdict, detail);
    try {
      if (!isTestPreviewClient()) {
        check("Environment", "fail", "Not connected to approved TEST Storage.");
        return;
      }
      const current = storedFixture();
      if (!current) {
        check("Synthetic fixture available", "inconclusive",
          "Create a TEST fixture first using the Registry Administrator in this same browser/origin.");
        return;
      }
      if (Date.now() - current.createdAt > 24 * 60 * 60 * 1000) {
        check("Fixture freshness", "inconclusive",
          "Fixture is over 24 hours old; ask Registry Administrator to remove it and recreate.");
        return;
      }
      const supabase = getSupabaseBrowserClient();
      if (!(await validateIdentity(supabase))) {
        check("Real signed-in identity", "fail", "Supabase Auth could not validate this TEST session.");
        return;
      }
      check("Real signed-in identity", "pass", "Supabase Auth validated the current session.");
      const admin = await registryAdmin();
      if (admin === null) {
        check("Registry role", "fail", "Live Registry Administrator check unavailable.");
        return;
      }
      check("Registry role verified", "pass",
        admin ? "Registry Administrator — private fixture access expected." :
          "Not a Registry Administrator — private fixture access must be denied.");

      // An independent client with NO persisted user session is an
      // actual anonymous Storage caller, not the logged-in browser client.
      const anon = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
          auth: { persistSession: false, autoRefreshToken: false },
        }
      );
      const anonymousDownload = await anon.storage.from(BUCKET).download(current.path);
      check("Anonymous private-object download",
        !anonymousDownload.data && isAccessDenied(anonymousDownload.error) ? "pass" :
          anonymousDownload.data ? "fail" : "inconclusive",
        anonymousDownload.data ? "Anonymous caller downloaded a private object — investigate immediately." :
          isAccessDenied(anonymousDownload.error) ? "Private object denied to anonymous caller." :
            "Could not conclusively classify anonymous Storage response.");

      const anonymousLink = await anon.storage.from(BUCKET).createSignedUrl(current.path, 60);
      check("Anonymous signed-URL issuance",
        !anonymousLink.data?.signedUrl && isAccessDenied(anonymousLink.error) ? "pass" :
          anonymousLink.data?.signedUrl ? "fail" : "inconclusive",
        anonymousLink.data?.signedUrl ? "Anonymous caller received a signed URL — investigate immediately." :
          isAccessDenied(anonymousLink.error) ? "Anonymous caller could not issue a signed URL." :
            "Could not conclusively classify anonymous signed-URL response.");

      const direct = await supabase.storage.from(BUCKET).download(current.path);
      if (admin) {
        const correct = Boolean(direct.data && !direct.error && await matchesFixture(direct.data));
        check("Registry Administrator private download", correct ? "pass" : "fail",
          correct ? "Exact synthetic PNG bytes verified under authorized signed JWT." :
            "Expected authorized synthetic PNG, but exact bytes were not received.");
      } else {
        check("Non-admin private-object download",
          !direct.data && isAccessDenied(direct.error) ? "pass" :
            direct.data ? "fail" : "inconclusive",
          direct.data ? "Unauthorized role downloaded the protected synthetic object." :
            isAccessDenied(direct.error) ? "Private-object download denied under signed JWT." :
              "Download did not succeed, but denial status could not be established.");
      }

      const link = await supabase.storage.from(BUCKET).createSignedUrl(current.path, 60);
      const issued = Boolean(!link.error && link.data?.signedUrl);
      check(admin ? "Registry Administrator signed-URL issuance" : "Non-admin signed-URL issuance",
        admin ? issued ? "pass" : "fail" :
          issued ? "fail" : isAccessDenied(link.error) ? "pass" : "inconclusive",
        admin ? issued ? "Authorized signed URL issued for 60 seconds, never copied or logged." :
            "Expected authorized signed URL but did not receive it." :
          issued ? "Unauthorized user obtained a signed URL — investigate immediately." :
            isAccessDenied(link.error) ? "Signed-URL creation denied under signed JWT." :
              "Signed-URL request did not succeed, but denial status was inconclusive.");

      check("fs-private bucket coverage", "inconclusive",
        "No synthetic object created: TEST has zero fs-private objects and no authenticated Storage access policy. No download claim.");
    } catch {
      check("Storage QA execution", "inconclusive",
        "Network or unexpected client error; tests must be rerun before acceptance.");
    } finally {
      setBusy(false);
    }
  };

  const removeFixture = async () => {
    if (busy || !user) return;
    setBusy(true);
    setStatus("");
    try {
      if (!isTestPreviewClient() || await registryAdmin() !== true) {
        setStatus("Removal requires the authorized TEST Registry Administrator.");
        return;
      }
      const current = storedFixture();
      if (!current) { setStatus("No fixture recorded in this browser."); return; }
      const supabase = getSupabaseBrowserClient();
      const result = await supabase.storage.from(BUCKET).remove([current.path]);
      if (result.error) {
        setStatus("Removal failed. Fixture remains recorded; retry from Registry Administrator account.");
        return;
      }
      const verify = await supabase.storage.from(BUCKET).download(current.path);
      if (verify.data || !isAccessDenied(verify.error)) {
        setStatus("Removal response received, but deletion could not be verified. Check TEST bucket and retry.");
        return;
      }
      window.localStorage.removeItem(STORAGE_KEY);
      setFixture(null);
      setChecks([]);
      setStatus("Synthetic fixture removed and download absence verified. No TEST QA file remains.");
    } catch {
      setStatus("Removal interrupted; fixture path remains stored for another cleanup attempt.");
    } finally {
      setBusy(false);
    }
  };

  const copyResults = async () => {
    const report = [
      "COWL-DOK RC1 TEST — Private Storage QA (sanitized)",
      "No signed URLs, object paths, access tokens, UUIDs, passwords or private data included.",
      ...checks.map(c => "[" + c.verdict.toUpperCase() + "] " + c.label + ": " + c.detail),
    ].join("\n");
    try { await navigator.clipboard.writeText(report); setStatus("Sanitized report copied."); }
    catch { setStatus("Clipboard unavailable. Share pass/fail totals instead."); }
  };

  const count = (kind: Verdict) => checks.filter(x => x.verdict === kind).length;
  return (
    <main className="min-h-screen bg-[#FBF9F9] px-4 py-10 text-[#271C20] sm:px-8">
      <div className="mx-auto max-w-3xl">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#890022]">
          COWL-DOK · RC1 TEST Preview Only
        </p>
        <h1 className="mt-2 font-serif text-3xl font-medium">Private Storage authorization QA</h1>
        <p className="mt-3 text-sm leading-6 text-[#57434A]">
          Tests a tiny synthetic image, not an existing member document. The
          Registry Administrator creates it once; each TEST account runs real
          private download and signed-URL checks. The administrator must remove
          the fixture afterward. No tokens, URLs or object paths are copied to reports.
        </p>
        <section className="mt-6 border border-[#E6DADC] bg-white p-5" aria-label="Storage QA controls">
          <p className="text-sm">
            {loading ? "Checking TEST session…" :
              user ? "TEST staff session present." :
                "Sign in with an existing TEST account first."}
          </p>
          {!loading && !user && (
            <Link href="/admin" className="mt-3 inline-block font-semibold text-[#890022] underline">
              Sign in to TEST
            </Link>
          )}
          <p className="mt-3 text-xs text-[#57434A]">
            Fixture: {fixture ? "Synthetic image recorded in this browser. Remove when tests finish." :
              "Not created yet. Start as Registry Administrator."}
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" disabled={busy || loading || !user || !!fixture}
              onClick={() => { void createFixture(); }}
              className="min-h-11 border border-[#890022] px-4 py-2 text-sm font-semibold text-[#890022] disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
              1. Create synthetic fixture
            </button>
            <button type="button" disabled={busy || loading || !user || !fixture}
              onClick={() => { void runChecks(); }}
              className="min-h-11 bg-[#890022] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
              2. Run download checks
            </button>
            <button type="button" disabled={busy || loading || !user || !fixture}
              onClick={() => { void removeFixture(); }}
              className="min-h-11 border border-[#9A1E31] px-4 py-2 text-sm font-semibold text-[#9A1E31] disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
              3. Remove fixture (admin)
            </button>
          </div>
          {busy && <p role="status" className="mt-3 text-sm">Working on TEST Storage…</p>}
          {status && <p role="status" className="mt-3 text-sm leading-6">{status}</p>}
        </section>

        {checks.length > 0 && (
          <section className="mt-7" aria-label="Storage test results">
            <h2 className="text-xl font-semibold">Checks</h2>
            <p className="mt-2 text-sm" role="status" aria-live="polite">
              {count("pass")} passed · {count("fail")} failed · {count("inconclusive")} inconclusive
            </p>
            <ul className="mt-4 space-y-3">
              {checks.map((c, i) => (
                <li key={i} className="border border-[#E6DADC] bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{c.label}</span>
                    <span className={"border px-2 py-1 text-xs font-bold uppercase " +
                      classes[c.verdict]}>{c.verdict}</span>
                  </div>
                  <p className="mt-2 text-sm text-[#57434A]">{c.detail}</p>
                </li>
              ))}
            </ul>
            <button type="button" disabled={busy} onClick={() => { void copyResults(); }}
              className="mt-5 min-h-11 bg-[#890022] px-4 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50">
              Copy sanitized results
            </button>
          </section>
        )}
        <p className="mt-7 text-xs leading-6 text-[#57434A]">
          Signed URLs are bearer links: someone with a valid unexpired URL can
          download that object. This test only verifies who may *issue* those links.
          The fixture path is stored locally in this browser and cleared after removal.
          TEST `fs-private` download coverage remains separate because no safe
          object exists and no authenticated Storage access policy is configured.
        </p>
      </div>
    </main>
  );
}
