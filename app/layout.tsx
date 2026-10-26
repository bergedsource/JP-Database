import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Acacia JP Fines — Oregon State",
  description: "Fine lookup for Oregon State Chapter of Acacia Fraternity",
  appleWebApp: { capable: true, title: "Acacia JP", statusBarStyle: "default" },
  metadataBase: new URL("https://jp-database.vercel.app"),
  openGraph: {
    title: "Acacia JP",
    description: "Look up your fines, pay your balance, and take a ticket for JP. Oregon State Chapter of Acacia.",
    url: "/",
    siteName: "Acacia JP",
    type: "website",
  },
  twitter: { card: "summary_large_image", title: "Acacia JP", description: "Your fines, your balance and your spot in line at JP." },
};

// Tints the phone browser bar Beaver Orange.
export const viewport: Viewport = {
  themeColor: "#D73F09",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <SpeedInsights />
      </body>
    </html>
  );
}
