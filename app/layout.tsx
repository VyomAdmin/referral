import type { Metadata } from "next";
import { Geist_Mono, Poppins } from "next/font/google";
import { headers } from "next/headers";
import { ThemeToggle, THEME_INIT_SCRIPT } from "./components/theme-toggle";
import "./globals.css";

// Matches the brand font used on nuvisionautoglass.com (--font-primary: "Poppins", ...).
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  style: ["normal", "italic"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "referrals.nuvisionautoglass.com";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const description = "A simple way to share NuVision, track every referral, and receive rewards.";
  return {
    metadataBase: new URL(origin),
    title: { default: "NuVision Referrals", template: "%s | NuVision Referrals" },
    description,
    openGraph: {
      title: "NuVision Referrals",
      description,
      type: "website",
      images: [{ url: new URL("/og.png", origin).toString(), width: 1200, height: 630, alt: "NuVision Referrals — Share. Track. Get rewarded." }],
    },
    twitter: {
      card: "summary_large_image",
      title: "NuVision Referrals",
      description,
      images: [new URL("/og.png", origin).toString()],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${poppins.variable} ${geistMono.variable}`}>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {children}
        <ThemeToggle />
      </body>
    </html>
  );
}
