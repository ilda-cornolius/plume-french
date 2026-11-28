import type { Metadata, Viewport } from "next";
import { Syne, Figtree } from "next/font/google";
import "./globals.css";
import { SiteNav } from "@/components/SiteNav";
import { Providers } from "@/components/Providers";
import { PwaRegister } from "@/components/PwaRegister";

const display = Syne({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

const body = Figtree({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Plume — French writing practice",
  description:
    "Practice French writing and chat with Gemini AI, levels, and AnkiWeb sync.",
  applicationName: "Plume",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Plume",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/icon-192.png", sizes: "192x192" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#07141c",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${body.variable} antialiased text-lg`}>
        <Providers>
          <div className="atmosphere grain relative min-h-screen">
            <div className="relative z-10">
              <SiteNav />
              {children}
            </div>
          </div>
          <PwaRegister />
        </Providers>
      </body>
    </html>
  );
}
