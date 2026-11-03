"use client";

import { createContext } from "react";

// Provide optional workspace presentation settings without passing custom
// props to a Next.js App Router page (whose default export must be a page).
export type CsvImportTab = "import" | "renewal" | "history" | "pending";

export type CsvImportWorkspaceOptions = {
  embedded?: boolean;
  workspaceTab?: CsvImportTab;
  onWorkspaceTabChange?: (next: CsvImportTab) => void;
};

export const CsvImportWorkspaceContext = createContext<CsvImportWorkspaceOptions>({});
