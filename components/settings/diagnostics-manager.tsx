"use client";

import { useState } from "react";
import { CheckCircle2, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";

type DiagnosticCheck = { key: string; label: string; ok: boolean; detail: string; required: boolean };
type DiagnosticPayload = {
  requiredReady: boolean;
  optionalReady: number;
  optionalTotal: number;
  checks: DiagnosticCheck[];
  checkedAt: string;
};

export function DiagnosticsManager({ isAdmin }: { isAdmin: boolean }) {
  const [result, setResult] = useState<DiagnosticPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    if (!isAdmin || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/diagnostics", { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "Diagnostics failed");
      setResult(json);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Diagnostics failed");
    } finally {
      setBusy(false);
    }
  }

  if (!isAdmin) return null;

  return <div className="section-card diagnostics-card">
    <div className="diagnostics-heading"><div><h3><ShieldCheck size={16}/> Evaluator diagnostics</h3><p className="muted">Runs read-only checks against this deployed workspace and its configured services.</p></div><button className="chip" onClick={() => void run()} disabled={busy}><RefreshCw size={14}/>{busy ? "Checking…" : result ? "Run again" : "Run checks"}</button></div>
    {error && <p className="form-error">{error}</p>}
    {result && <>
      <div className={`diagnostics-summary ${result.requiredReady ? "ready" : "blocked"}`}>
        {result.requiredReady ? <CheckCircle2 size={18}/> : <TriangleAlert size={18}/>}<strong>{result.requiredReady ? "Core deployment ready" : "Core deployment has blockers"}</strong><span>{result.optionalReady}/{result.optionalTotal} provider integrations configured</span>
      </div>
      <div className="diagnostics-list">{result.checks.map((check) => <div className="diagnostic-row" key={check.key}><span className={`diagnostic-dot ${check.ok ? "ok" : check.required ? "error" : "warning"}`}/><div><strong>{check.label}</strong><p className="muted">{check.detail}</p></div><small>{check.required ? "Required" : "External"}</small></div>)}</div>
      <p className="muted">Checked {new Date(result.checkedAt).toLocaleString()}</p>
    </>}
  </div>;
}
