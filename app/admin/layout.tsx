import { Figtree } from "next/font/google";

// Self-hosted by next/font so the CSP's font-src 'self' allows it (same face as the homepage).
const sans = Figtree({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-sans" });

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // One typeface everywhere: headings that ask for --font-serif get Figtree too.
  return <div className={sans.variable} style={{ ["--font-serif" as string]: "var(--font-sans)" }}>{children}</div>;
}
