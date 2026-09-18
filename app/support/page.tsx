import type { Metadata } from "next";
import Link from "next/link";
export const metadata: Metadata = {
  title: "Support and setup",
  description: "Set up RelayDesk on Windows, macOS, or Linux and connect paired devices to compatible MCP clients.",
  alternates: { canonical: "/support" },
  openGraph: { title: "Support and setup | RelayDesk", description: "Set up RelayDesk on Windows, macOS, or Linux and connect paired devices to compatible MCP clients." },
};

export default function Support(){return <main className="shell"><section className="card"><div className="eyebrow">RelayDesk Support</div><h1>Setup and support</h1><p className="lead">RelayDesk only operates devices deliberately paired by their owner. Use paired devices from ChatGPT, Claude, or any compatible remote MCP client. The current background agent supports Windows, macOS, and Linux computers and servers.</p><p className="muted">If a paired device is offline, confirm its lightweight RelayDesk background agent/service is running and that the device has outbound internet access. Normal sleep, restart, Wi-Fi changes, or temporary network errors should reconnect automatically; re-pair only after an explicit revoke or lost credential.</p><div className="actions"><Link className="button primary" href="/auth/login">Open RelayDesk</Link><a className="button" href="https://github.com/Lakshay-24/RelayDesk/issues">Open support issue</a></div><div className="links"><Link href="/">Home</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></div></section></main>}
