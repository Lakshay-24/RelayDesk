import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import BillingCard from "./BillingCard";

export const metadata: Metadata = {
  title: "Pricing — Free and Pro",
  description: "Start free with 5,000 remote tool calls per month. Upgrade to RelayDesk Pro with localized Razorpay subscription pricing where available.",
  alternates: { canonical: "/pricing" },
  openGraph: { title: "Pricing — Free and Pro | RelayDesk", description: "Start free with 5,000 remote tool calls per month. Upgrade to RelayDesk Pro with localized Razorpay subscription pricing where available." },
};

const countryCurrency:Record<string,string>={IN:"INR",US:"USD"};

export default async function Pricing(){
  const h=await headers();
  const country=(h.get("x-vercel-ip-country")??"").toUpperCase();
  const preferredCurrency=countryCurrency[country]??"USD";
  return <main className="shell">
    <div className="hero-top"><Link className="brand" href="/"><img className="brand-mark" src="/relaydesk-mark.svg" alt="" width={34} height={34} /><span>RelayDesk</span></Link><Link className="button" href="/auth/login">Sign in</Link></div>
    <div className="eyebrow">Pricing</div>
    <h1>Start free. Pay only when you use it heavily.</h1>
    <p className="lead">RelayDesk keeps the remote bridge simple: your own machines, your own AI clients, and predictable remote tool-call limits.</p>
    <div className="pricing-grid">
      <section className="price-card"><div className="eyebrow">Free</div><div className="price">$0 <span>/ month</span></div><p>5,000 remote tool calls per month.</p><p className="small">ChatGPT, Claude and compatible MCP clients · multiple paired devices · community support.</p><Link className="button primary" href="/auth/login">Get started</Link></section>
      <BillingCard preferredCurrency={preferredCurrency}/>
    </div>
    <div className="links"><Link href="/">Home</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/refunds">Cancellation & refunds</Link><Link href="/contact">Contact</Link></div>
  </main>
}
