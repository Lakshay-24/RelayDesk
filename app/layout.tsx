import "./globals.css";
import type { Metadata } from "next";

const siteUrl = "https://relay-desk-mjq6.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "RelayDesk — Remote MCP for your devices",
    template: "%s | RelayDesk",
  },
  description: "Securely connect devices you own to ChatGPT, Claude, and compatible MCP clients. Pair once, keep credentials on-device, and run remote tools through RelayDesk.",
  applicationName: "RelayDesk",
  category: "developer tools",
  keywords: [
    "RelayDesk",
    "remote MCP",
    "Model Context Protocol",
    "ChatGPT MCP",
    "Claude MCP",
    "remote computer control",
    "remote server control",
    "AI tools",
    "device automation",
  ],
  alternates: { canonical: "/" },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/relaydesk-mark.svg", type: "image/svg+xml" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/relaydesk-mark.svg",
  },
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "RelayDesk",
    title: "RelayDesk — Remote MCP for your devices",
    description: "Securely connect devices you own to ChatGPT, Claude, and compatible MCP clients.",
  },
  twitter: {
    card: "summary",
    title: "RelayDesk — Remote MCP for your devices",
    description: "Securely connect devices you own to ChatGPT, Claude, and compatible MCP clients.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

const softwareJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "RelayDesk",
  url: siteUrl,
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Windows, macOS, Linux",
  description: "Remote MCP bridge for devices you own, usable from compatible AI clients.",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
    description: "Free plan with 10,000 remote tool calls per month.",
  },
};

export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="en">
    <head>
      <meta name="theme-color" content="#0b0d10" />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }}
      />
    </head>
    <body>{children}</body>
  </html>;
}
