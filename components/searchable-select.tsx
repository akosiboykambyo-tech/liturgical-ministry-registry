"use client";

import { useState } from "react";
import { Check, ChevronsUpDown } from "@/components/phosphor-icons";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

interface SearchableSelectProps {
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  searchPlaceholder?: string;
  emptyText?: string;
  allValue?: string;
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder,
  searchPlaceholder = "Type to search...",
  emptyText = "No matches found.",
  allValue = "All",
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);

  const selectedLabel = value === allValue ? placeholder : value;

  const handleSelect = (nextValue: string) => {
    onChange(nextValue);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-[38px] w-full justify-between px-2.5 font-normal hover:bg-background"
        >
          <span className="truncate text-sm">{selectedLabel}</span>
          <ChevronsUpDown
            aria-hidden="true"
            className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50"
          />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] min-w-[280px] p-0"
        align="start"
      >
        <Command>
          <CommandInput placeholder={searchPlaceholder} />

          <CommandList className="max-h-[280px] scrollbar-thin">
            <CommandEmpty>{emptyText}</CommandEmpty>

            <CommandItem
              value={placeholder}
              onSelect={() => handleSelect(allValue)}
              className="cursor-pointer gap-2"
            >
              <div
                className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-primary",
                  value === allValue
                    ? "bg-primary text-primary-foreground"
                    : "opacity-50"
                )}
              >
                {value === allValue && (
                  <Check aria-hidden="true" className="h-3 w-3" />
                )}
              </div>
              <span className="truncate text-sm">{placeholder}</span>
            </CommandItem>

            {options.map((option) => {
              const isSelected = value === option;

              return (
                <CommandItem
                  key={option}
                  value={option}
                  onSelect={() => handleSelect(option)}
                  className="cursor-pointer gap-2"
                >
                  <div
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-primary",
                      isSelected
                        ? "bg-primary text-primary-foreground"
                        : "opacity-50"
                    )}
                  >
                    {isSelected && (
                      <Check aria-hidden="true" className="h-3 w-3" />
                    )}
                  </div>

                  <span className="truncate text-sm">{option}</span>
                </CommandItem>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
