import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Instant Research — powered by Cerebras",
  description:
    "Agentic research that fans out parallel sub-queries and writes a cited answer in seconds, on the Cerebras Inference API.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
