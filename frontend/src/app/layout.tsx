import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
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
  title: "HydroSim 3D | Flood Routing & Valley Risk Modeler",
  description:
    "Interactive 3D Flood Routing, Hydraulic Modeling, and Downstream Settlement Risk Analysis System for Mountain Basins.",
  keywords: [
    "HydroSim",
    "Flood Simulation",
    "Hydraulic Modeling",
    "Manning Strickler",
    "Nepal Floods",
    "Bhotekoshi",
    "Rasuwa",
    "3D Terrain",
    "GLOF",
  ],
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
        <Analytics />
      </body>
    </html>
  );
}
