import "./globals.css";
import type { Metadata } from "next";

export const metadata:Metadata = { title:"RelayDesk", description:"Secure remote MCP control for computers you own" };
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="en"><body>{children}</body></html>; }
