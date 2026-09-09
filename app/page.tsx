import Link from "next/link";

export default function Home() {
  return (
    <main className="landing">
      <div className="landing-badge">RelayDesk · Remote MCP</div>
      <h1>Control computers you own from ChatGPT.</h1>
      <p>
        RelayDesk pairs a lightweight local agent with a secure hosted MCP relay so authorized users can read and edit files, search projects, run terminal workflows, and manage their own devices.
      </p>
      <p>
        Authentication starts automatically when a compatible MCP client connects to RelayDesk. There is no standalone account dashboard on this site.
      </p>
      <div className="landing-actions">
        <Link className="button primary" href="/support">Setup &amp; support</Link>
        <a className="button secondary" href="https://github.com/Lakshay-24/RelayDesk" target="_blank" rel="noreferrer">Public project</a>
      </div>
      <p className="muted" style={{ marginTop: 24 }}>
        <Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link>
      </p>
    </main>
  );
}
