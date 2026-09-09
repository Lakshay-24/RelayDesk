import Link from "next/link";

export default function SupportPage() {
  return (
    <main className="landing">
      <div className="landing-badge">RelayDesk Support</div>
      <h1>Support and review help</h1>
      <p>
        RelayDesk is intended only for computers deliberately paired by their owner. If a device appears offline, restart the local RelayDesk agent and confirm the machine has internet access before retrying.
      </p>
      <p>
        For authorization issues, sign in again through the RelayDesk OAuth flow. Device credentials can be rotated or revoked without changing the user account.
      </p>
      <p>
        For public support, bug reports, or reviewer setup questions, open an issue in the public RelayDesk repository.
      </p>
      <p>
        <a className="button secondary" href="https://github.com/Lakshay-24/RelayDesk/issues" target="_blank" rel="noreferrer">Open RelayDesk support issue</a>
      </p>
      <p className="muted"><Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link> · <Link href="/">Home</Link></p>
    </main>
  );
}
