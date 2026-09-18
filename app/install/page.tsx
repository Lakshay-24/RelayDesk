import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Install RelayDesk",
  description: "Install the RelayDesk device agent on Windows, macOS, or Linux with one command. Pair once and keep the agent running in the background.",
  alternates: { canonical: "/install" },
};

const windows = "irm https://relay-desk-mjq6.vercel.app/install.ps1 | iex";
const unix = "curl -fsSL https://relay-desk-mjq6.vercel.app/install.sh | bash";

export default function Install(){
  return <main className="shell">
    <div className="hero-top">
      <Link className="brand" href="/"><img className="brand-mark" src="/relaydesk-mark.svg" alt="" width={34} height={34}/><span>RelayDesk</span></Link>
      <Link className="button" href="/dashboard">Dashboard</Link>
    </div>

    <div className="eyebrow">Device setup</div>
    <h1>Install once. Pair once. Keep using your device from compatible AI clients.</h1>
    <p className="lead">The installer downloads an isolated RelayDesk runtime, verifies the official Node runtime checksum, installs the current device agent, opens browser pairing, and registers the background service. You do not need Git or a global Node/npm installation.</p>

    <section className="panel">
      <h2>Windows</h2>
      <p className="small">Open PowerShell as the Windows account that should own the RelayDesk device and run:</p>
      <pre className="install-command"><code>{windows}</code></pre>
      <p className="small"><a href="/install.ps1">Inspect the PowerShell installer</a> before running it.</p>
    </section>

    <section className="panel">
      <h2>macOS / Linux</h2>
      <p className="small">Run this from Terminal. On a headless Linux server, run it as the account that should own the device; root installs create a system service.</p>
      <pre className="install-command"><code>{unix}</code></pre>
      <p className="small"><a href="/install.sh">Inspect the shell installer</a> before running it.</p>
    </section>

    <section className="panel">
      <h2>What happens</h2>
      <div className="connection-grid">
        <div><strong>1. Runtime</strong><p className="small">RelayDesk installs a private, checksum-verified Node runtime under your user profile. It does not replace your system Node.</p></div>
        <div><strong>2. Pairing</strong><p className="small">A browser page opens with a short pairing code. Approve it with the RelayDesk account that should own this device.</p></div>
        <div><strong>3. Background service</strong><p className="small">Windows Task Scheduler, macOS LaunchAgent, or Linux systemd keeps the agent alive and reconnects after normal restarts/network drops.</p></div>
        <div><strong>4. AI client</strong><p className="small">Connect RelayDesk's MCP endpoint from ChatGPT, Claude, or another compatible MCP client using your RelayDesk account.</p></div>
      </div>
    </section>

    <section className="panel">
      <h2>Network & security</h2>
      <p className="small">RelayDesk needs outbound HTTPS only. It does not open an inbound RelayDesk port and does not require an SSH tunnel. Device credentials remain on the paired device and can be revoked from your dashboard.</p>
    </section>

    <div className="links"><Link href="/support">Support</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></div>
  </main>
}
