"use client";

import { createContext } from "react";

// Embedded tools keep their existing database operations but hand page-level
// headings and navigation to the parent Registration workspace.
export const RegistrationEmbeddedContext = createContext(false);
