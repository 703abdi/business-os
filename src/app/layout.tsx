import type { Metadata, Viewport } from "next";
import { Inter_Tight } from "next/font/google";
import "./globals.css";
import "leaflet/dist/leaflet.css";
import { BRAND } from "@/config/brand";

const sans = Inter_Tight({ variable: "--font-app-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: `${BRAND.name} OS`, template: `%s · ${BRAND.name}` },
  description: `${BRAND.name} business dashboard`,
  appleWebApp: { capable: true, title: BRAND.name, statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: BRAND.colors.ink,
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Brand colors from src/config/brand.ts become CSS variables used by the theme in globals.css.
const brandVars = {
  "--brand": BRAND.colors.primary,
  "--brand-dark": BRAND.colors.primaryDark,
  "--brand-accent": BRAND.colors.accent,
  "--brand-ink": BRAND.colors.ink,
} as React.CSSProperties;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} h-full antialiased`} style={brandVars}>
      <body className="min-h-full bg-background text-foreground">{children}</body>
    </html>
  );
}
