import Link from "next/link";

export default function Home() {
  return <main className="landing">
    <div className="landing-badge">Customer support, without the bloat.</div>
    <h1>Chat, email and knowledge.<br/>One intelligent inbox.</h1>
    <p>RelayDesk gives small teams an embeddable messenger, shared email inbox, searchable help centre and continuously updated AI summaries.</p>
    <div className="landing-actions"><Link className="button primary" href="/signup">Create workspace</Link><Link className="button secondary" href="/login">Sign in</Link></div>
  </main>;
}
