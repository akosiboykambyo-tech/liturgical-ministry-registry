"use client";

import { ebGaramond } from "@/app/fonts";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Eye,
  Loader2,
  Megaphone,
  RotateCcw,
  Save,
  Wrench,
} from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const ANNOUNCEMENT_KEY = "public_marquee";
const MAINTENANCE_KEY = "public_maintenance";
const DEFAULT_TEXT =
  "ROMAN CATHOLIC DIOCESE OF KALOOKAN · Diocesan Commission on Worship & Liturgy";
const DEFAULT_MAINTENANCE_MESSAGE =
  "The registry is being updated. Please try again shortly.";
const MAX_LENGTH = 220;

type AnnouncementSetting = {
  enabled: boolean;
  text: string;
  expires_at: string;
};

type MaintenanceSetting = {
  enabled: boolean;
  message: string;
  expected_back: string;
};

function announcementFrom(value: unknown): AnnouncementSetting {
  if (!value || typeof value !== "object") {
    return { enabled: true, text: DEFAULT_TEXT, expires_at: "" };
  }

  const record = value as Record<string, unknown>;

  return {
    enabled: record.enabled !== false,
    text:
      typeof record.text === "string" && record.text.trim()
        ? record.text.trim()
        : DEFAULT_TEXT,
    expires_at:
      typeof record.expires_at === "string" ? record.expires_at : "",
  };
}

function maintenanceFrom(value: unknown): MaintenanceSetting {
  if (!value || typeof value !== "object") {
    return {
      enabled: false,
      message: DEFAULT_MAINTENANCE_MESSAGE,
      expected_back: "",
    };
  }

  const record = value as Record<string, unknown>;

  return {
    enabled: record.enabled === true,
    message:
      typeof record.message === "string" && record.message.trim()
        ? record.message.trim()
        : DEFAULT_MAINTENANCE_MESSAGE,
    expected_back:
      typeof record.expected_back === "string" ? record.expected_back : "",
  };
}

export default function PublicWebsiteSettingsPage() {
  const supabase = getSupabaseBrowserClient();

  const [announcement, setAnnouncement] = useState<AnnouncementSetting>({
    enabled: true,
    text: DEFAULT_TEXT,
    expires_at: "",
  });
  const [maintenance, setMaintenance] = useState<MaintenanceSetting>({
    enabled: false,
    message: DEFAULT_MAINTENANCE_MESSAGE,
    expected_back: "",
  });

  const [loading, setLoading] = useState(true);
  const [savingAnnouncement, setSavingAnnouncement] = useState(false);
  const [savingMaintenance, setSavingMaintenance] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: loadError } = await supabase
      .from("system_settings")
      .select("key,value")
      .in("key", [ANNOUNCEMENT_KEY, MAINTENANCE_KEY]);

    if (loadError) {
      setError(loadError.message);
      setLoading(false);
      return;
    }

    const rows = data ?? [];
    const announcementRow = rows.find((row) => row.key === ANNOUNCEMENT_KEY);
    const maintenanceRow = rows.find((row) => row.key === MAINTENANCE_KEY);

    if (announcementRow) setAnnouncement(announcementFrom(announcementRow.value));
    if (maintenanceRow) setMaintenance(maintenanceFrom(maintenanceRow.value));

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveAnnouncement() {
    const text = announcement.text.trim();

    if (announcement.enabled && !text) {
      setError("Enter announcement text or turn the announcement off.");
      return;
    }

    setSavingAnnouncement(true);
    setSaved(null);
    setError(null);

    const { error: saveError } = await supabase.from("system_settings").upsert({
      key: ANNOUNCEMENT_KEY,
      value: {
        enabled: announcement.enabled,
        text: text || DEFAULT_TEXT,
        expires_at: announcement.expires_at || null,
      },
      is_default: false,
    });

    setSavingAnnouncement(false);

    if (saveError) {
      setError(saveError.message);
      return;
    }

    setAnnouncement((current) => ({
      ...current,
      text: text || DEFAULT_TEXT,
    }));
    setSaved("Announcement saved.");
    window.setTimeout(() => setSaved(null), 2500);
  }

  async function saveMaintenance() {
    const message = maintenance.message.trim();

    if (maintenance.enabled && !message) {
      setError("Enter a maintenance message before turning maintenance mode on.");
      return;
    }

    setSavingMaintenance(true);
    setSaved(null);
    setError(null);

    const { error: saveError } = await supabase.from("system_settings").upsert({
      key: MAINTENANCE_KEY,
      value: {
        enabled: maintenance.enabled,
        message: message || DEFAULT_MAINTENANCE_MESSAGE,
        expected_back: maintenance.expected_back || null,
      },
      is_default: false,
    });

    setSavingMaintenance(false);

    if (saveError) {
      setError(saveError.message);
      return;
    }

    setMaintenance((current) => ({
      ...current,
      message: message || DEFAULT_MAINTENANCE_MESSAGE,
    }));
    setSaved(
      maintenance.enabled
        ? "Maintenance mode is on."
        : "Maintenance mode is off."
    );
    window.setTimeout(() => setSaved(null), 2500);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 text-[#1E1114]">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Megaphone className="h-6 w-6 text-primary" />
          Public Website
        </h1>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Manage the public announcement and planned maintenance state.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-none border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      {saved && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-none border border-emerald-600/20 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
        >
          <CheckCircle2 className="h-4 w-4" />
          {saved}
        </div>
      )}

      <section className="overflow-hidden rounded-none border border-[#E6DADC] border-t-[3px] border-t-[#890022] bg-white ">
        <div className="border-b border-border px-5 py-4 sm:px-6">
          <h2 className="text-base font-semibold">Header announcement</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Visitors can dismiss the announcement with the X button. An expired
            announcement is hidden automatically.
          </p>
        </div>

        <div className="space-y-6 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-5 rounded-none border border-border bg-muted/20 p-4">
            <div>
              <p className="text-sm font-semibold">Show announcement</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Turn this off to hide the announcement from public pages.
              </p>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={announcement.enabled}
              onClick={() =>
                setAnnouncement((current) => ({
                  ...current,
                  enabled: !current.enabled,
                }))
              }
              className={[
                "relative h-7 w-12 shrink-0 rounded-full transition-colors",
                announcement.enabled ? "bg-primary" : "bg-muted-foreground/30",
              ].join(" ")}
            >
              <span
                className={[
                  "absolute left-0 top-1 h-5 w-5 rounded-full bg-white  transition-transform",
                  announcement.enabled ? "translate-x-6" : "translate-x-1",
                ].join(" ")}
              />
              <span className="sr-only">
                {announcement.enabled ? "Disable" : "Enable"} public announcement
              </span>
            </button>
          </div>

          <div>
            <div className="flex items-end justify-between gap-3">
              <label htmlFor="marquee-text" className="text-sm font-medium">
                Announcement text
              </label>
              <span className="text-xs text-muted-foreground">
                {announcement.text.length}/{MAX_LENGTH}
              </span>
            </div>
            <textarea
              id="marquee-text"
              rows={4}
              maxLength={MAX_LENGTH}
              value={announcement.text}
              onChange={(event) =>
                setAnnouncement((current) => ({
                  ...current,
                  text: event.target.value,
                }))
              }
              className="mt-2 w-full resize-y rounded-none border border-input bg-background px-3.5 py-3 text-sm leading-6"
            />
          </div>

          <div>
            <label htmlFor="marquee-expiry" className="text-sm font-medium">
              Hide automatically after
            </label>
            <input
              id="marquee-expiry"
              type="datetime-local"
              value={announcement.expires_at}
              onChange={(event) =>
                setAnnouncement((current) => ({
                  ...current,
                  expires_at: event.target.value,
                }))
              }
              className="mt-2 min-h-11 w-full max-w-sm rounded-none border border-input bg-background px-3.5 py-2 text-sm"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Leave blank for no automatic expiration.
            </p>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-semibold">Preview</p>
            </div>
            <div className="mt-3 flex items-center justify-between gap-4 rounded-none bg-[#3A0010] px-4 py-3 text-white">
              <p className="truncate text-sm">
                {announcement.text.trim() || DEFAULT_TEXT}
              </p>
              <span className="text-lg">×</span>
            </div>
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={() =>
                setAnnouncement({
                  enabled: true,
                  text: DEFAULT_TEXT,
                  expires_at: "",
                })
              }
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-none border border-border px-4 py-2 text-sm font-medium"
            >
              <RotateCcw className="h-4 w-4" />
              Restore default
            </button>

            <button
              type="button"
              onClick={() => void saveAnnouncement()}
              disabled={savingAnnouncement}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-none bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {savingAnnouncement ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save announcement
            </button>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-none border border-[#E6DADC] border-t-[3px] border-t-[#890022] bg-white ">
        <div className="border-b border-border px-5 py-4 sm:px-6">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Wrench className="h-4 w-4 text-primary" />
            Maintenance mode
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            When enabled, public registry pages show the maintenance screen.
            Admin pages remain available.
          </p>
        </div>

        <div className="space-y-6 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-5 rounded-none border border-border bg-muted/20 p-4">
            <div>
              <p className="text-sm font-semibold">Maintenance mode</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Turn this on only for planned maintenance or an outage response.
              </p>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={maintenance.enabled}
              onClick={() =>
                setMaintenance((current) => ({
                  ...current,
                  enabled: !current.enabled,
                }))
              }
              className={[
                "relative h-7 w-12 shrink-0 rounded-full transition-colors",
                maintenance.enabled ? "bg-primary" : "bg-muted-foreground/30",
              ].join(" ")}
            >
              <span
                className={[
                  "absolute left-0 top-1 h-5 w-5 rounded-full bg-white  transition-transform",
                  maintenance.enabled ? "translate-x-6" : "translate-x-1",
                ].join(" ")}
              />
              <span className="sr-only">
                {maintenance.enabled ? "Disable" : "Enable"} maintenance mode
              </span>
            </button>
          </div>

          <div>
            <label htmlFor="maintenance-message" className="text-sm font-medium">
              Public message
            </label>
            <textarea
              id="maintenance-message"
              rows={3}
              value={maintenance.message}
              onChange={(event) =>
                setMaintenance((current) => ({
                  ...current,
                  message: event.target.value,
                }))
              }
              className="mt-2 w-full resize-y rounded-none border border-input bg-background px-3.5 py-3 text-sm leading-6"
            />
          </div>

          <div>
            <label htmlFor="expected-back" className="text-sm font-medium">
              Expected back
            </label>
            <input
              id="expected-back"
              type="datetime-local"
              value={maintenance.expected_back}
              onChange={(event) =>
                setMaintenance((current) => ({
                  ...current,
                  expected_back: event.target.value,
                }))
              }
              className="mt-2 min-h-11 w-full max-w-sm rounded-none border border-input bg-background px-3.5 py-2 text-sm"
            />
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              Leave blank if the return time is not yet known.
            </p>
          </div>

          <div className="border-t border-border pt-5">
            <button
              type="button"
              onClick={() => void saveMaintenance()}
              disabled={savingMaintenance}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-none bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {savingMaintenance ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save maintenance settings
            </button>
          </div>
        </div>
      </section>

      <p className="text-xs leading-5 text-muted-foreground">
        Maintenance mode here is application-controlled. If the entire hosting
        platform or database is unavailable, use the hosting provider&apos;s
        maintenance/fallback mechanism as well.
      </p>
    </div>
  );
}