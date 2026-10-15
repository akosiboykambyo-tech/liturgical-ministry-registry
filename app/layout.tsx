import "./globals.css";
import type { Metadata } from "next";
import { AuthProvider } from "@/lib/auth-context";
import { inter, ebGaramond } from "@/app/fonts";
import { SiteMotion } from "@/components/site-motion";

const siteUrl = "https://cowl-dok.online";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),

  title: {
    default: "Liturgical Ministry Registry",
    template: "%s | Liturgical Ministry Registry",
  },

  description:
    "Official public registry for verifying liturgical ministry registration in the Diocese of Kalookan.",

  themeColor: "#890022",

  manifest: "/images/site.webmanifest",

  icons: {
    icon: [
      {
        url: "/images/favicon.ico",
        sizes: "48x48",
      },
      {
        url: "/images/favicon-32x32.png",
        type: "image/png",
        sizes: "32x32",
      },
      {
        url: "/images/favicon-16x16.png",
        type: "image/png",
        sizes: "16x16",
      },
    ],
    apple: [
      {
        url: "/images/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },

  openGraph: {
    type: "website",
    locale: "en_PH",
    url: siteUrl,
    siteName: "Liturgical Ministry Registry",
    title: "Liturgical Ministry Registry",
    description:
      "Official public registry for verifying liturgical ministry registration in the Diocese of Kalookan.",
    images: [
      {
        url: "/share/og-image.png",
        width: 1200,
        height: 630,
        alt: "Liturgical Ministry Registry — public verification",
      },
    ],
  },

  twitter: {
    card: "summary_large_image",
    title: "Liturgical Ministry Registry",
    description:
      "Official public registry for verifying liturgical ministry registration in the Diocese of Kalookan.",
    images: ["/share/twitter-image.png"],
  },
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
        <AuthProvider>
          <SiteMotion>{children}</SiteMotion>
        </AuthProvider>
      </body>
    </html>
  );
}