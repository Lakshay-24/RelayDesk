"use client";

import { Copy, ExternalLink, MessageSquareText } from "lucide-react";
import { useState } from "react";

type Props = {
  appUrl: string;
  workspaceKey: string;
  onNotice: (text: string) => void;
};

export function WidgetInstallCard({ appUrl, workspaceKey, onNotice }: Props) {
  const [copied, setCopied] = useState(false);
  const snippet = `<script src="${appUrl}/widget/loader.js" data-workspace="${workspaceKey}" async></script>`;
  const demoUrl = `${appUrl}/widget?workspace=${encodeURIComponent(workspaceKey)}`;

  async function copySnippet() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      onNotice("Website chat script copied.");
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      onNotice("Could not access the clipboard. Select and copy the script manually.");
    }
  }

  return (
    <div className="section-card widget-install-card">
      <h3><MessageSquareText size={17}/>Website chat widget</h3>
      <p className="muted">This is the customer chat bubble. Test it instantly or add one script tag to any website.</p>
      <ol className="widget-steps">
        <li>Open the live demo and send a customer message.</li>
        <li>Return to Inbox; the conversation should appear.</li>
        <li>For a real site, paste this script before <code>&lt;/body&gt;</code>.</li>
      </ol>
      <pre className="code-block">{snippet}</pre>
      <div className="filters widget-actions">
        <button className="chip" type="button" onClick={copySnippet}>
          <Copy size={14}/>{copied ? "Copied" : "Copy install script"}
        </button>
        <a className="primary-button" href={demoUrl} target="_blank" rel="noreferrer">
          <ExternalLink size={15}/>Test live chat
        </a>
      </div>
      <p className="muted widget-hint">The demo opens as a visitor in a new tab. Keep RelayDesk Inbox open in this tab.</p>
    </div>
  );
}
