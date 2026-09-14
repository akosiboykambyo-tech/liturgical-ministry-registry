"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

interface MultiSelectComboboxProps {
  options: readonly string[];
  selected: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
  searchPlaceholder?: string;
  emptyText?: string;
  /** Show a short label/abbreviation for each option's badge instead of the full string */
  formatBadge?: (value: string) => string;
  className?: string;
}

export function MultiSelectCombobox({
  options,
  selected,
  onChange,
  placeholder,
  searchPlaceholder = "Type to search...",
  emptyText = "No matches found.",
  formatBadge,
  className,
}: MultiSelectComboboxProps) {
  const [open, setOpen] = useState(false);

  const toggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  const clearAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange([]);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "h-auto min-h-[42px] w-full justify-between px-2.5 py-1.5 font-normal hover:bg-background",
            "transition-all duration-150",
            selected.length > 0 && "border-primary/40 ring-1 ring-primary/10",
            className
          )}
        >
          <div className="flex flex-1 flex-wrap items-center gap-1 overflow-hidden">
            {selected.length === 0 ? (
              <span className="truncate text-sm text-muted-foreground">
                {placeholder}
              </span>
            ) : selected.length <= 2 ? (
              selected.map((v) => (
                <Badge
                  key={v}
                  variant="secondary"
                  className="max-w-[140px] truncate font-normal"
                >
                  {formatBadge ? formatBadge(v) : v}
                </Badge>
              ))
            ) : (
              <Badge variant="secondary" className="font-normal">
                {selected.length} selected
              </Badge>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {selected.length > 0 && (
              <span
                role="button"
                tabIndex={0}
                onClick={clearAll}
                className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Clear selection"
              >
                <X className="h-3.5 w-3.5" />
              </span>
            )}
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList className="max-h-[280px] scrollbar-thin">
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = selected.includes(option);
                return (
                  <CommandItem
                    key={option}
                    value={option}
                    onSelect={() => toggle(option)}
                    className="cursor-pointer gap-2 transition-colors"
                  >
                    <div
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-primary transition-colors",
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : "opacity-50"
                      )}
                    >
                      {isSelected && <Check className="h-3 w-3" />}
                    </div>
                    <span className="truncate text-sm">{option}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
          {selected.length > 0 && (
            <div className="flex items-center justify-between border-t border-border px-3 py-2">
              <span className="text-xs text-muted-foreground">
                {selected.length} selected
              </span>
              <button
                onClick={() => onChange([])}
                className="text-xs font-medium text-primary hover:underline"
              >
                Clear
              </button>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
