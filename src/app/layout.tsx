import type { Metadata } from "next";
import { Syne, Figtree } from "next/font/google";
import "./globals.css";
import { SiteNav } from "@/components/SiteNav";

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
    "Practice French writing with instant corrections, then sync your AnkiWeb decks.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${body.variable} antialiased`}>
        <div className="atmosphere grain relative min-h-screen">
          <div className="relative z-10">
            <SiteNav />
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
