"use client";

import { MINISTRIES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Check } from "@/components/phosphor-icons";

interface Props {
  value: string[];
  onChange: (vals: string[]) => void;
  columns?: 1 | 2;
  error?: string;
}

export function MinistryMultiSelect({ value, onChange, columns = 2, error }: Props) {
  const toggle = (m: string) => {
    if (value.includes(m)) {
      onChange(value.filter((v) => v !== m));
    } else {
      onChange([...value, m]);
    }
  };

  return (
    <div>
      <div
        className={cn(
          "grid gap-2",
          columns === 2 ? "sm:grid-cols-2" : "grid-cols-1"
        )}
      >
        {MINISTRIES.map((m) => {
          const selected = value.includes(m);
          return (
            <label
              key={m}
              className={cn(
                "flex items-start gap-2.5 rounded-md border p-2.5 cursor-pointer transition-colors",
                selected
                  ? "border-primary bg-primary/5"
                  : "border-border bg-background hover:bg-muted/60"
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                  selected
                    ? "bg-primary border-primary text-primary-foreground"
                    : "border-input bg-background"
                )}
              >
                {selected && <Check className="h-3 w-3" />}
              </span>
              <input
                type="checkbox"
                checked={selected}
                onChange={() => toggle(m)}
                className="sr-only"
              />
              <span className="text-xs leading-snug select-none">{m}</span>
            </label>
          );
        })}
      </div>
      {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
    </div>
  );
}
