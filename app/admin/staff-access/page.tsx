"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { ebGaramond } from "@/app/fonts";
import { useAuth } from "@/lib/auth-context";
import {
  ArrowLeft, AlertCircle, RefreshCw, ShieldCheck, UserPlus, Users,
} from "@/components/phosphor-icons";

type RoleCode =
  | "registry_administrator"
  | "cowl_financial_workspace_viewer"
  | "curia_financial_workspace_viewer";
type StaffRole = {
  roleCode: string;
  active: boolean;
  grantedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
};
type StaffMember = {
  id: string;
  email: string;
  invitedAt: string | null;
  confirmedAt: string | null;
  lastSignInAt: string | null;
  roles: StaffRole[];
};
type Directory = {
  users: StaffMember[];
  currentUserId: string;
  mutationsEnabled: boolean;
};
type Action = "grant" | "revoke";

const STAFF_ROLES: Array<{ code: RoleCode; label: string }> = [
  { code: "registry_administrator", label: "Registry Administrator" },
  { code: "cowl_financial_workspace_viewer", label: "COWL Financial Administrator (Read-only)" },
  { code: "curia_financial_workspace_viewer", label: "Curia Financial Administrator (Read-only)" },
];
const roleLabel = (role: string) =>
  STAFF_ROLES.find(entry => entry.code === role)?.label ??
  (role === "platform_provisioner" ? "Platform Provisioner" : "Other restricted role");

function dateLabel(value: string | null) {
  if (!value) return "Not yet";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })
    : "Unavailable";
}

const inputStyle = "mt-1.5 block min-h-11 w-full min-w-0 rounded-none border border-[#BFAFB3] bg-white px-3 text-sm text-[#1E1114] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#890022] disabled:cursor-not-allowed disabled:bg-[#F4F0F0]";
const primaryStyle = "inline-flex min-h-11 items-center justify-center gap-2 rounded-none bg-[#890022] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#6C001B] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#890022] disabled:cursor-not-allowed disabled:opacity-50";
const secondaryStyle = "inline-flex min-h-11 items-center justify-center gap-2 rounded-none border border-[#BFAFB3] bg-white px-4 text-sm font-medium text-[#5A1730] hover:bg-[#FBF3F5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#890022] disabled:opacity-50";

export default function StaffAndAccessPage() {
  const { session, loading: authLoading } = useAuth();
  const [directory, setDirectory] = useState<Directory | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "denied" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<RoleCode>("registry_administrator");
  const [inviteReason, setInviteReason] = useState("");
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [changeAction, setChangeAction] = useState<Action>("grant");
  const [changeRole, setChangeRole] = useState<RoleCode>("registry_administrator");
  const [changeReason, setChangeReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);

  const load = useCallback(async (token: string, signal?: AbortSignal) => {
    setLoadState("loading");
    setLoadError("");
    try {
      const response = await fetch("/api/admin/staff-access", {
        headers: { Authorization: "Bearer " + token },
        cache: "no-store",
        signal,
      });
      const body = await response.json() as Directory & { error?: string };
      if (!response.ok) {
        setLoadState(response.status === 403 ? "denied" : "error");
        setDirectory(null);
        setLoadError(body.error ?? "The staff directory could not be loaded.");
        return;
      }
      if (!Array.isArray(body.users)) throw new Error("Invalid directory response");
      setDirectory(body);
      setLoadState("ready");
    } catch {
      if (signal?.aborted) return;
      setDirectory(null);
      setLoadState("error");
      setLoadError("Unable to load staff. Check your connection and try again.");
    }
  }, []);

  useEffect(() => {
    if (authLoading || !session?.access_token) return;
    const controller = new AbortController();
    void load(session.access_token, controller.signal);
    return () => controller.abort();
  }, [authLoading, session?.access_token, load]);

  const filtered = useMemo(() => (directory?.users ?? [])
    .filter(user => user.email.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => a.email.localeCompare(b.email)), [directory, search]);
  const staffWithAccess = (directory?.users ?? []).filter(u => u.roles.some(r => r.active)).length;
  const unassigned = (directory?.users ?? []).filter(u => !u.roles.some(r => r.active)).length;
  const selected = directory?.users.find(u => u.id === selectedUser) ?? null;
  const enabled = directory?.mutationsEnabled === true;

  async function mutate(payload: Record<string, string>) {
    if (!session?.access_token || !enabled || mutating) return;
    setMutating(true);
    setNotice(null);
    try {
      const result = await fetch("/api/admin/staff-access", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + session.access_token,
        },
        cache: "no-store",
        body: JSON.stringify(payload),
      });
      const body = await result.json() as { error?: string; message?: string };
      if (!result.ok) {
        setNotice({ error: true, text: body.error ?? "No access change was confirmed." });
        return;
      }
      setNotice({ error: false, text: body.message ?? "Request completed." });
      setInviteEmail("");
      setInviteReason("");
      setChangeReason("");
      setConfirmed(false);
      await load(session.access_token);
    } catch {
      setNotice({ error: true, text: "The request outcome could not be confirmed. Refresh the directory before trying again." });
    } finally {
      setMutating(false);
    }
  }

  function submitInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!enabled || inviteReason.trim().length < 12 || !inviteEmail.includes("@")) return;
    void mutate({
      action: "invite", email: inviteEmail.trim(),
      role: inviteRole, reason: inviteReason.trim(),
    });
  }

  function submitChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!enabled || !selected || selected.id === directory?.currentUserId ||
        !confirmed || changeReason.trim().length < 12) return;
    void mutate({
      action: changeAction, userId: selected.id,
      role: changeRole, reason: changeReason.trim(),
    });
  }

  return (
    <div className="space-y-6 pb-12 text-[#1E1114]">
      <div>
        <Link href="/admin/administration" className="inline-flex min-h-10 items-center gap-2 text-sm font-medium text-[#890022] underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#890022]">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> System Management
        </Link>
        <p className="mt-3 text-xs font-semibold uppercase tracking-[0.15em] text-[#890022]">SYSTEM MANAGEMENT</p>
        <h1 className={ebGaramond.className + " mt-1 text-[42px] font-medium leading-none sm:text-[48px]"}>
          Staff and Access
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-[#6B5C62]">
          Invite authorized staff, review their assigned roles, and manage access to Registry, COWL, and Curia workspaces.
        </p>
      </div>

      <div className="border-l-[3px] border-[#890022] bg-[#FBF3F5] p-4 text-sm leading-6 text-[#5A1730]">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <p><strong>Protected administration.</strong> Registry Administrator status alone does not authorize staff provisioning.
            A separately approved Platform Provisioner grant is required. Every access change must include a documented reason.</p>
        </div>
      </div>

      {loadState === "loading" && (
        <div className="border border-[#E6DADC] bg-white px-5 py-12 text-center text-sm text-[#6B5C62]" role="status">
          Checking authorization and loading the staff directory…
        </div>
      )}
      {(loadState === "denied" || loadState === "error") && (
        <div className="border border-[#E6DADC] border-l-[3px] border-l-[#890022] bg-white p-6" role="alert">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-6 w-6 shrink-0 text-[#890022]" aria-hidden="true" />
            <div className="space-y-2">
              <h2 className="text-lg font-semibold">{loadState === "denied" ? "Provisioning access required" : "Staff directory unavailable"}</h2>
              <p className="text-sm leading-6 text-[#6B5C62]">{loadError}</p>
              {loadState === "error" && (
                <button type="button" onClick={() => session?.access_token && void load(session.access_token)} className={secondaryStyle}>
                  <RefreshCw className="h-4 w-4" aria-hidden="true" /> Retry
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {loadState === "ready" && directory && (
        <>
          {!enabled && (
            <div className="border border-[#D4C0A0] bg-[#FFFCF5] px-5 py-4 text-sm leading-6 text-[#645036]" role="status">
              <strong>Review-only mode.</strong> Invitations, role grants and revocations remain disabled until the
              controlled database migration, signed-role tests, and release approval are complete.
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { value: directory.users.length, label: "Staff accounts", description: "Supabase Auth identities" },
              { value: staffWithAccess, label: "With active access", description: "At least one approved role" },
              { value: unassigned, label: "Without active access", description: "Invited, expired or unassigned" },
            ].map(item => (
              <div key={item.label} className="border border-[#E6DADC] border-t-[3px] border-t-[#890022] bg-white px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#6B5C62]">{item.label}</p>
                <p className={ebGaramond.className + " mt-2 text-[38px] leading-none text-[#890022]"}>{item.value}</p>
                <p className="mt-2 text-xs text-[#6B5C62]">{item.description}</p>
              </div>
            ))}
          </div>

          {notice && (
            <p role={notice.error ? "alert" : "status"}
              className={"border-l-[3px] px-4 py-3 text-sm leading-6 " +
                (notice.error ? "border-[#890022] bg-[#FBF3F5] text-[#71132C]" : "border-[#0B5C5A] bg-[#F1FAF7] text-[#0B5C5A]")}>
              {notice.text}
            </p>
          )}

          <section aria-labelledby="invite-title" className="border border-[#E6DADC] bg-white p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <UserPlus className="mt-1 h-6 w-6 shrink-0 text-[#890022]" aria-hidden="true"/>
              <div>
                <h2 id="invite-title" className="text-xl font-semibold">Invite Staff</h2>
                <p className="mt-1 text-sm leading-6 text-[#6B5C62]">
                  Invitations are sent to the staff member's email. Roles are stored separately from their password and profile.
                </p>
              </div>
            </div>
            <form className="mt-5 grid gap-4 md:grid-cols-2" onSubmit={submitInvite}>
              <label className="block text-sm font-medium">Official email address
                <input type="email" autoComplete="email" required className={inputStyle}
                  disabled={!enabled || mutating} maxLength={254} value={inviteEmail}
                  onChange={event => setInviteEmail(event.target.value)} placeholder="staff@example.org"/>
              </label>
              <label className="block text-sm font-medium">Approved role
                <select className={inputStyle} disabled={!enabled || mutating}
                  value={inviteRole} onChange={event => setInviteRole(event.target.value as RoleCode)}>
                  {STAFF_ROLES.map(role => <option value={role.code} key={role.code}>{role.label}</option>)}
                </select>
              </label>
              <label className="block text-sm font-medium md:col-span-2">Approval reference or reason
                <textarea required rows={2} minLength={12} maxLength={500}
                  disabled={!enabled || mutating} className={inputStyle + " py-3"}
                  value={inviteReason} onChange={event => setInviteReason(event.target.value)}
                  placeholder="Record who approved this staff access and why."/>
              </label>
              <div className="md:col-span-2">
                <button type="submit" className={primaryStyle} disabled={!enabled || mutating || inviteReason.trim().length < 12}>
                  <UserPlus className="h-4 w-4" aria-hidden="true" />
                  {mutating ? "Submitting…" : "Send Invitation"}
                </button>
              </div>
            </form>
          </section>

          <section aria-labelledby="directory-title" className="border border-[#E6DADC] bg-white">
            <div className="flex flex-col gap-4 border-b border-[#E6DADC] p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <Users className="mt-1 h-6 w-6 shrink-0 text-[#890022]" aria-hidden="true"/>
                <div>
                  <h2 id="directory-title" className="text-xl font-semibold">Staff Directory</h2>
                  <p className="mt-1 text-sm text-[#6B5C62]">{filtered.length} account{filtered.length === 1 ? "" : "s"} shown</p>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <label className="text-sm font-medium">Search email
                  <input className={inputStyle + " sm:w-56"} type="search"
                    value={search} onChange={event => setSearch(event.target.value)} placeholder="Search staff"/>
                </label>
                <button type="button" className={secondaryStyle} onClick={() => session?.access_token && void load(session.access_token)} disabled={mutating}>
                  <RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh
                </button>
              </div>
            </div>
            {filtered.length === 0 ? (
              <p className="px-5 py-12 text-center text-sm text-[#6B5C62]">No staff accounts match this search.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[740px] text-left text-sm">
                  <thead className="bg-[#FBF9F9] text-xs uppercase tracking-wide text-[#6B5C62]">
                    <tr>
                      <th scope="col" className="px-5 py-3 font-semibold">Staff account</th>
                      <th scope="col" className="px-5 py-3 font-semibold">Assigned access</th>
                      <th scope="col" className="px-5 py-3 font-semibold">Last sign-in</th>
                      <th scope="col" className="px-5 py-3 font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E6DADC]">
                    {filtered.map(user => {
                      const active = user.roles.filter(role => role.active);
                      return (
                        <tr key={user.id} className="align-top hover:bg-[#FBF9F9]">
                          <td className="break-all px-5 py-4">
                            <span className="font-semibold">{user.email}</span>
                            <span className="mt-1 block text-xs text-[#6B5C62]">
                              {user.confirmedAt ? "Account confirmed" : user.invitedAt ? "Invitation pending" : "Not confirmed"}
                            </span>
                          </td>
                          <td className="px-5 py-4">
                            {active.length ? (
                              <div className="flex max-w-[320px] flex-wrap gap-1.5">
                                {active.map((role, i) => (
                                  <span className="border border-[#B7D4CC] bg-[#F1FAF7] px-2 py-1 text-xs font-medium text-[#0B5C5A]"
                                    key={role.roleCode + i}>{roleLabel(role.roleCode)}</span>
                                ))}
                              </div>
                            ) : <span className="text-[#6B5C62]">No active role</span>}
                          </td>
                          <td className="whitespace-nowrap px-5 py-4 text-[#6B5C62]">{dateLabel(user.lastSignInAt)}</td>
                          <td className="px-5 py-4">
                            <button type="button" className={secondaryStyle} disabled={!enabled || user.id === directory.currentUserId}
                              onClick={() => { setSelectedUser(user.id); setConfirmed(false); setChangeReason(""); }}>
                              Manage roles
                            </button>
                            {user.id === directory.currentUserId && (
                              <span className="mt-1 block text-xs text-[#6B5C62]">Your own access is protected.</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {enabled && selected && (
            <section aria-labelledby="change-role-title" className="border border-[#E6DADC] border-t-[3px] border-t-[#890022] bg-white p-5 sm:p-6">
              <h2 id="change-role-title" className="text-xl font-semibold">Manage Roles</h2>
              <p className="mt-2 break-all text-sm text-[#6B5C62]">{selected.email}</p>
              <form onSubmit={submitChange} className="mt-5 grid gap-4 md:grid-cols-2">
                <label className="text-sm font-medium">Action
                  <select className={inputStyle} disabled={mutating} value={changeAction}
                    onChange={event => { setChangeAction(event.target.value as Action); setConfirmed(false); }}>
                    <option value="grant">Grant an approved role</option>
                    <option value="revoke">Revoke an active role</option>
                  </select>
                </label>
                <label className="text-sm font-medium">Role
                  <select className={inputStyle} disabled={mutating} value={changeRole}
                    onChange={event => { setChangeRole(event.target.value as RoleCode); setConfirmed(false); }}>
                    {STAFF_ROLES.map(role => <option value={role.code} key={role.code}>{role.label}</option>)}
                  </select>
                </label>
                <label className="text-sm font-medium md:col-span-2">Approval / revocation reason
                  <textarea rows={2} required minLength={12} maxLength={500} className={inputStyle + " py-3"}
                    disabled={mutating} value={changeReason} onChange={event => setChangeReason(event.target.value)} />
                </label>
                <label className="flex items-start gap-3 text-sm leading-6 md:col-span-2">
                  <input type="checkbox" className="mt-1 h-4 w-4 accent-[#890022]" checked={confirmed}
                    disabled={mutating} onChange={event => setConfirmed(event.target.checked)}/>
                  I confirm that this access change has been approved and documented.
                </label>
                <div className="flex flex-wrap gap-2 md:col-span-2">
                  <button type="submit" className={primaryStyle}
                    disabled={!confirmed || mutating || changeReason.trim().length < 12}>
                    {mutating ? "Submitting…" : changeAction === "grant" ? "Grant Role" : "Revoke Role"}
                  </button>
                  <button type="button" className={secondaryStyle} disabled={mutating} onClick={() => setSelectedUser(null)}>Cancel</button>
                </div>
              </form>
            </section>
          )}
        </>
      )}
      <p className="max-w-3xl text-xs leading-5 text-[#6B5C62]">
        COWL-DOK does not store staff passwords in this page. Authentication is handled by Supabase Auth;
        role assignments are independently checked by the database. Financial transaction permissions remain outside this module.
      </p>
    </div>
  );
}
