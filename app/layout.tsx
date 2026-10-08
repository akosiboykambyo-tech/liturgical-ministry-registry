import "./globals.css";
import type { Metadata } from "next";
import { AuthProvider } from "@/lib/auth-context";
import { inter, ebGaramond } from "@/app/fonts";

export const metadata: Metadata = {
  title: "Liturgical Ministry Registry",
  description:
    "Centralized registry and verification system for liturgical ministry members.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.className} ${ebGaramond.variable}`}
        suppressHydrationWarning
      >
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
