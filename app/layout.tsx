import type { Metadata } from "next";
import {
  Geist,
  Geist_Mono,
  Barlow_Condensed,
  Cormorant_Garamond,
  DM_Mono,
} from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const barlowCondensed = Barlow_Condensed({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["400", "600", "700", "800", "900"],
  style: ["normal", "italic"],
});

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
});

const dmMono = DM_Mono({
  variable: "--font-dm-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  style: ["normal"],
});

export const metadata: Metadata = {
  title: "Crosslist — List Once. Sell Everywhere.",
  description:
    "Cross-post your listings to Facebook Marketplace, Grailed, eBay, and Depop simultaneously from a single inventory dashboard.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${barlowCondensed.variable} ${cormorant.variable} ${dmMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
