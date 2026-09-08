import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IWB BESS Day-Ahead Workbench",
  description: "Interview prototype for explainable battery Day-Ahead trading",
};
export const viewport: Viewport = { themeColor: "#f3f7f6" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
