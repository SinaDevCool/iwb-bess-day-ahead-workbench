import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./workspace.css";
import "./unified.css";

export const metadata: Metadata = {
  title: "IWB BESS Day-Ahead Workbench",
  description:
    "Explainable battery dispatch optimization and Day-Ahead order generation",
};
export const viewport: Viewport = { themeColor: "#f3f7f6" };

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
