import { Cormorant_Garamond, Lato } from "next/font/google";

// Self-hosted by next/font so the CSP's font-src 'self' allows them (same pair as the homepage).
const serif = Cormorant_Garamond({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-serif" });
const sans = Lato({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-sans" });

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className={`${serif.variable} ${sans.variable}`}>{children}</div>;
}
