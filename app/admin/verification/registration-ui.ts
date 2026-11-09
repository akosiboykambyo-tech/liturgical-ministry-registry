/** Shared visual grammar for Registration.
 * Inherits the diocesan design language used by Dashboard and Member Records:
 * square white institutional surfaces, crimson action/navigation, and
 * reserved semantic status colors. Never affects the admin sidebar.
 */
export const registrationUi = {
  panel: "border border-[#E6DADC] border-t-[3px] border-t-[#890022] bg-white p-5 sm:p-6",
  choice: "border border-[#E6DADC] bg-[#FBF9F9] p-4",
  row: "border-b border-[#E6DADC] last:border-b-0",
  primary: "inline-flex min-h-11 items-center justify-center gap-2 bg-[#970E24] px-4 py-2 text-[15px] font-semibold text-white transition-colors hover:bg-[#890022] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#970E24] disabled:opacity-50",
  secondary: "inline-flex min-h-11 items-center justify-center gap-2 border border-[#E6DADC] bg-white px-4 py-2 text-[15px] font-semibold text-[#890022] transition-colors hover:border-[#970E24] hover:bg-[#FBF3F4] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#970E24] disabled:opacity-50",
  input: "min-h-11 w-full border border-[#D7CACC] bg-white px-3 py-2 text-sm text-[#1E1114] outline-none focus:border-[#970E24] focus:ring-2 focus:ring-[#970E24]/15",
  empty: "border border-dashed border-[#E6DADC] bg-white px-4 py-6 text-sm text-[#5F4A4F]",
  caption: "text-sm leading-6 text-[#5F4A4F]",
  info: "border-l-[3px] border-l-[#3B5278] bg-[#F3F5F8] px-4 py-3 text-xs leading-5 text-[#3B5278]",
  caution: "border-l-[3px] border-l-[#7A4E00] bg-[#FAF5E9] px-4 py-3 text-xs leading-5 text-[#7A4E00]",
  error: "border-l-4 border-l-[#B00020] bg-[#FBEFEF] px-4 py-3 text-sm text-[#B00020]",
} as const;

/** Case-type colors are informational, not official registry statuses. */
export const registrationCaseVisual = {
  approvals: { accent: "#890022", text: "text-[#890022]", label: "Pending verification" },
  renewal: { accent: "#7A4E00", text: "text-[#7A4E00]", label: "Renewal attention" },
  duplicates: { accent: "#3B5278", text: "text-[#3B5278]", label: "Possible duplicate" },
} as const;
