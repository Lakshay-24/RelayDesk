import "./globals.css";
import "./responsive.css";
import "./ux-polish.css";
import "./inbox-polish.css";
import "./mobile-fixes.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "RelayDesk",
  description: "Secure remote MCP control for computers you own",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
