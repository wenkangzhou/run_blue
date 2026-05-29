import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { Analytics } from "@vercel/analytics/next";

export const metadata: Metadata = {
  title: "跑蓝 Run Blue - Track Your Running Journey",
  description: "Connect with Strava to visualize your running data and track your progress",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "跑蓝",
  },
  icons: {
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180" },
    ],
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  themeColor: "#2563eb",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <Providers>
          {children}
        </Providers>
        <Analytics />
      </body>
    </html>
  );
}
