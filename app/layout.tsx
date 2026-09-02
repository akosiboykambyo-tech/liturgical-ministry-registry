import './globals.css';
import type { Metadata } from 'next';
import { Inter, EB_Garamond, Montserrat, Playfair_Display } from 'next/font/google';
import { AuthProvider } from '@/lib/auth-context';

const inter = Inter({ subsets: ['latin', 'latin-ext'] });
const ebGaramond = EB_Garamond({ subsets: ['latin', 'latin-ext'], weight: ['400', '500', '600', '700'], variable: '--font-eb-garamond' });
const montserrat = Montserrat({ subsets: ['latin', 'latin-ext'], weight: ['400', '500', '600', '700'], variable: '--font-montserrat' });
const playfair = Playfair_Display({ subsets: ['latin', 'latin-ext'], weight: ['400', '500', '600', '700'], variable: '--font-playfair' });

export const metadata: Metadata = {
  title: 'Liturgical Ministry Registry',
  description:
    'Centralized registry and verification system for liturgical ministry members.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} ${ebGaramond.variable} ${montserrat.variable} ${playfair.variable}`} suppressHydrationWarning>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
