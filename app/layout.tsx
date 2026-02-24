import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
