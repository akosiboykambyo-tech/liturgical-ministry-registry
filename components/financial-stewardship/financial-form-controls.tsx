"use client";

import { useState } from "react";
import { DayPicker } from "react-day-picker";
import { CalendarDays, Check, ChevronDown } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export const CONTROL_CLASS =
  "h-11 w-full min-w-0 border border-[#CDBFC3] bg-white px-3 text-sm text-[#1E1114] outline-none focus-visible:border-[#890022] focus-visible:ring-1 focus-visible:ring-[#890022]";
export const LABEL_CLASS = "mb-1.5 block text-xs font-semibold text-[#5F4A4F]";

export type Choice = { value: string; label: string };
export function FinancialChoice({
  id, label, value, onChange, options, searchPlaceholder = "Search options...",
}: {
  id: string; label: string; value: string; onChange: (value: string) => void;
  options: Choice[]; searchPlaceholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find(option => option.value === value);
  return <div className="min-w-0">
    <label htmlFor={id} className={LABEL_CLASS}>{label}</label>
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button id={id} type="button" role="combobox" aria-expanded={open} aria-haspopup="listbox"
          className={CONTROL_CLASS + " flex items-center justify-between gap-2 text-left"}>
          <span className="min-w-0 flex-1 truncate">{selected?.label || "Choose an option"}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-[#6F6265]" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(90vw,430px)] rounded-sm border-[#CDBFC3] bg-white p-0 shadow-lg">
        <Command>
          <CommandInput placeholder={searchPlaceholder} className="h-11 text-sm" />
          <CommandList className="max-h-64">
            <CommandEmpty>No matching options.</CommandEmpty>
            <CommandGroup>
              {options.map(option => <CommandItem key={option.value} value={option.label}
                onSelect={() => { onChange(option.value); setOpen(false); }}
                className="min-h-10 cursor-pointer gap-2 py-2 text-sm text-[#1E1114] aria-selected:bg-[#F5E8EC]">
                <Check className={value === option.value
                  ? "h-4 w-4 shrink-0 text-[#0B5C5A]"
                  : "h-4 w-4 shrink-0 opacity-0"} aria-hidden="true" />
                <span className="whitespace-normal">{option.label}</span>
              </CommandItem>)}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  </div>;
}

export function readableFinancialDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "Select a date";
  const date = new Date(value + "T12:00:00Z");
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return "Select a date";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date);
}
function parseLocalDate(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  const result = new Date(year, month - 1, day);
  return result.getFullYear() === year && result.getMonth() === month - 1 && result.getDate() === day ? result : undefined;
}
function isoFromLocalDate(value: Date): string {
  return String(value.getFullYear()).padStart(4, "0") + "-" +
    String(value.getMonth() + 1).padStart(2, "0") + "-" +
    String(value.getDate()).padStart(2, "0");
}
export function FinancialDate({
  id, label, value, onChange,
}: {
  id: string; label: string; value: string; onChange: (date: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = parseLocalDate(value);
  return <div className="min-w-0">
    <label htmlFor={id} className={LABEL_CLASS}>{label}</label>
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button id={id} type="button" aria-label={label + ": " + readableFinancialDate(value)}
          aria-expanded={open} aria-haspopup="dialog"
          className={CONTROL_CLASS + " flex items-center justify-between gap-2 text-left"}>
          <span className="truncate">{readableFinancialDate(value)}</span>
          <CalendarDays className="h-4 w-4 shrink-0 text-[#6F6265]" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto max-w-[calc(100vw-2rem)] rounded-sm border-[#CDBFC3] bg-white p-3 shadow-lg">
        <DayPicker
          mode="single"
          selected={selected}
          defaultMonth={selected || new Date(2026, 10, 7)}
          onSelect={day => { if (day) { onChange(isoFromLocalDate(day)); setOpen(false); } }}
          fromYear={2000}
          toYear={2100}
          captionLayout="dropdown-buttons"
          showOutsideDays
          classNames={{
            months: "flex flex-col",
            month: "space-y-3",
            caption: "relative flex min-h-9 items-center justify-center gap-2",
            caption_label: "text-sm font-semibold text-[#4D343A]",
            caption_dropdowns: "flex items-center justify-center gap-1",
            dropdown: "rounded-sm border border-[#D9CBD0] bg-white px-1 py-1 text-sm text-[#4D343A]",
            dropdown_month: "text-sm",
            dropdown_year: "text-sm",
            nav: "flex items-center gap-1",
            nav_button: "h-8 w-8 rounded-sm border border-[#E6DADC] bg-white text-[#890022] hover:bg-[#F8EDEF]",
            nav_button_previous: "absolute left-0",
            nav_button_next: "absolute right-0",
            table: "w-full border-collapse",
            head_row: "flex",
            head_cell: "h-9 w-9 text-center text-xs font-medium text-[#786970]",
            row: "mt-1 flex w-full",
            cell: "relative h-9 w-9 text-center text-sm",
            day: "h-9 w-9 rounded-sm text-sm text-[#1E1114] hover:bg-[#F8EDEF] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#890022]",
            day_selected: "bg-[#890022] font-semibold text-white hover:bg-[#70001C] hover:text-white",
            day_today: "border border-[#890022] font-semibold",
            day_outside: "text-[#B8ACB0] opacity-60",
            day_disabled: "text-[#B8ACB0] opacity-40",
          }}
        />
      </PopoverContent>
    </Popover>
  </div>;
}
