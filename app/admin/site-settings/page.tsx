"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Eye,
  Loader2,
  Megaphone,
  RotateCcw,
  Save,
} from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const SETTING_KEY = "public_marquee";
const DEFAULT_TEXT =
  "ROMAN CATHOLIC DIOCESE OF KALOOKAN · Diocesan Commission on Worship & Liturgy";
const MAX_LENGTH = 220;

type MarqueeSetting = {
  enabled: boolean;
  text: string;
};

function normalizeSetting(value: unknown): MarqueeSetting {
  if (!value || typeof value !== "object") {
    return { enabled: true, text: DEFAULT_TEXT };
  }

  const record = value as Record<string, unknown>;

  return {
    enabled: record.enabled !== false,
    text:
      typeof record.text === "string" && record.text.trim()
        ? record.text.trim()
        : DEFAULT_TEXT,
  };
}

export default function PublicWebsiteSettingsPage() {
  const supabase = getSupabaseBrowserClient();
  const [setting, setSetting] = useState<MarqueeSetting>({
    enabled: true,
    text: DEFAULT_TEXT,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: loadError } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", SETTING_KEY)
      .maybeSingle();

    if (loadError) {
      setError(loadError.message);
    } else if (data) {
      setSetting(normalizeSetting(data.value));
    }

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async () => {
    const text = setting.text.trim();

    if (setting.enabled && !text) {
      setError("Enter announcement text or turn the marquee off.");
      return;
    }

    setSaving(true);
    setSaved(false);
    setError(null);

    const { error: saveError } = await supabase.from("system_settings").upsert({
      key: SETTING_KEY,
      value: {
        enabled: setting.enabled,
        text: text || DEFAULT_TEXT,
      },
      is_default: false,
    });

    setSaving(false);

    if (saveError) {
      setError(saveError.message);
      return;
    }

    setSetting((current) => ({
      ...current,
      text: text || DEFAULT_TEXT,
    }));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  };

  const resetToDefault = () => {
    setSetting({
      enabled: true,
      text: DEFAULT_TEXT,
    });
    setSaved(false);
    setError(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Megaphone className="h-6 w-6 text-primary" />
          Public Website
        </h1>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Manage public-facing website settings without changing code or
          redeploying the Registry.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      {saved && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-lg border border-emerald-600/20 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
        >
          <CheckCircle2 className="h-4 w-4" />
          Public website settings saved.
        </div>
      )}

      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="border-b border-border px-5 py-4 sm:px-6">
          <h2 className="text-base font-semibold">Header announcement</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Controls the scrolling diocesan announcement shown above the public
            website header.
          </p>
        </div>

        <div className="space-y-6 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-5 rounded-lg border border-border bg-muted/20 p-4">
            <div>
              <p className="text-sm font-semibold">Show announcement</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Turn this off to hide the marquee completely from public pages.
              </p>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={setting.enabled}
              onClick={() =>
                setSetting((current) => ({
                  ...current,
                  enabled: !current.enabled,
                }))
              }
              className={[
                "relative h-7 w-12 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                setting.enabled ? "bg-primary" : "bg-muted-foreground/30",
              ].join(" ")}
            >
              <span
                className={[
                  "absolute left-0 top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
                  setting.enabled ? "translate-x-6" : "translate-x-1",
                ].join(" ")}
              />
              <span className="sr-only">
                {setting.enabled ? "Disable" : "Enable"} public announcement
              </span>
            </button>
          </div>

          <div className="space-y-2">
            <div className="flex items-end justify-between gap-3">
              <label
                htmlFor="marquee-text"
                className="text-sm font-medium text-foreground"
              >
                Announcement text
              </label>
              <span className="text-xs text-muted-foreground">
                {setting.text.length}/{MAX_LENGTH}
              </span>
            </div>

            <textarea
              id="marquee-text"
              value={setting.text}
              maxLength={MAX_LENGTH}
              rows={4}
              onChange={(event) =>
                setSetting((current) => ({
                  ...current,
                  text: event.target.value,
                }))
              }
              placeholder={DEFAULT_TEXT}
              className="w-full resize-y rounded-lg border border-input bg-background px-3.5 py-3 text-sm leading-6 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />

            <p className="text-xs leading-5 text-muted-foreground">
              Keep this concise. Animation speed, color, and typography remain
              controlled by the site design.
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Preview</h3>
            </div>

            {setting.enabled ? (
              <div className="overflow-hidden rounded-lg bg-[#970e24] px-4 py-3 text-white">
                <p className="truncate text-xs font-semibold uppercase tracking-[0.09em]">
                  {setting.text.trim() || DEFAULT_TEXT}
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                Announcement is currently hidden.
              </div>
            )}
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={resetToDefault}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
            >
              <RotateCcw className="h-4 w-4" />
              Restore default text
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {saving ? "Saving..." : "Save changes"}
            </button>
          </div>
        </div>
      </section>

      <p className="text-xs leading-5 text-muted-foreground">
        Public pages use the saved value the next time they load. If this
        setting is unavailable, the built-in diocesan announcement is used as a
        fallback.
      </p>
    </div>
  );
}
