import type { Metadata } from "next";
import { Syne, Newsreader, JetBrains_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  display: "swap",
  preload: true,
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
  preload: true,
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
  preload: true,
});

export const metadata: Metadata = {
  title: "ghexplainer — AI-Powered GitHub Repository Analyzer",
  description:
    "Generate deep, structured technical documentation for any public GitHub repository. Covers architecture, data flow, key logic, and interview prep notes — powered by Google Gemini.",
  keywords: ["github", "repository", "analyzer", "documentation", "AI", "gemini", "code analysis"],
  authors: [{ name: "meet1785" }],
  openGraph: {
    title: "ghexplainer — AI-Powered GitHub Repository Analyzer",
    description: "Generate deep technical docs for any public GitHub repo in minutes.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* Preconnect to speed up font fetching */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Preconnect to GitHub API for faster first analysis */}
        <link rel="preconnect" href="https://api.github.com" />
        <meta name="theme-color" content="#08090d" />
      </head>
      <body
        className={`${syne.variable} ${newsreader.variable} ${jetbrainsMono.variable} font-sans antialiased bg-midnight text-cream`}
      >
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
