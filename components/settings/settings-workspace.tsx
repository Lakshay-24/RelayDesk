"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Globe2, Mail, Trash2, UserPlus, Users } from "lucide-react";
import type { Membership, Workspace } from "@/types/domain";
import { CannedResponsesManager } from "@/components/settings/canned-responses-manager";
import { WebhooksManager } from "@/components/settings/webhooks-manager";

type Domain = { id: string; hostname: string; verification_token: string; status: string; verified_at: string | null };
type TeamMember = { id: string; user_id: string; role: "admin" | "agent"; created_at: string; email: string | null; name: string | null };
type Invitation = { id: string; email: string; role: "admin" | "agent"; expires_at: string; accepted_at: string | null; created_at: string };
type Props = { workspace: Workspace; membership: Membership; initialDomains: Domain[]; inboundAddress: string | null; memberCount: number };

export function SettingsWorkspace({ workspace, membership, initialDomains, inboundAddress, memberCount }: Props) {
  const [domains, setDomains] = useState(initialDomains);
  const [hostname, setHostname] = useState("");
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "agent">("agent");
  const [notice, setNotice] = useState("");
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [teamBusy, setTeamBusy] = useState(false);

  const appUrl = typeof window !== "undefined" ? window.location.origin : process.env.NEXT_PUBLIC_APP_URL || "https://your-app.vercel.app";
  const snippet = `<script src="${appUrl}/widget/loader.js" data-workspace="${workspace.public_key}" async></script>`;

  async function loadTeam() {
    const response = await fetch("/api/team/members", { cache: "no-store" });
    const json = await response.json();
    if (response.ok) { setMembers(json.members ?? []); setInvitations(json.invitations ?? []); }
    else setNotice(json.error ?? "Could not load team");
  }
  useEffect(() => { void loadTeam(); }, []);

  async function invite() {
    if (!email.trim()) return;
    setTeamBusy(true);
    const response = await fetch("/api/team/invite", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspaceId: workspace.id, email: email.trim(), role: inviteRole }) });
    const json = await response.json();
    if (response.ok) { setNotice(json.warning ?? "Invitation sent"); setEmail(""); await loadTeam(); }
    else setNotice(json.error ?? "Could not invite");
    setTeamBusy(false);
  }

  async function changeMember(membershipId: string, role: "admin" | "agent") {
    setTeamBusy(true);
    const response = await fetch("/api/team/members", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ membershipId, role, action: "update" }) });
    const json = await response.json();
    if (response.ok) setMembers((current) => current.map((member) => member.id === membershipId ? { ...member, role } : member));
    else setNotice(json.error ?? "Could not update member");
    setTeamBusy(false);
  }

  async function removeMember(membershipId: string) {
    setTeamBusy(true);
    const response = await fetch("/api/team/members", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ membershipId, action: "remove" }) });
    const json = await response.json();
    if (response.ok) setMembers((current) => current.filter((member) => member.id !== membershipId));
    else setNotice(json.error ?? "Could not remove member");
    setTeamBusy(false);
  }

  async function addDomain() {
    const response = await fetch("/api/domains", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspaceId: workspace.id, hostname }) });
    const json = await response.json();
    if (response.ok) { setDomains((current) => [...current, json.domain]); setHostname(""); }
    else setNotice(json.error ?? "Could not add domain");
  }

  async function verify(domain: Domain) {
    const response = await fetch("/api/domains", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspaceId: workspace.id, domainId: domain.id }) });
    const json = await response.json();
    if (response.ok) setDomains((current) => current.map((item) => item.id === domain.id ? json.domain : item));
    else setNotice(json.error ?? "Could not verify domain");
  }

  const visibleMemberCount = members.length || memberCount;

  return (
    <section className="settings-page">
      <div className="page-title-row"><div><p className="eyebrow">{workspace.name}</p><h1>Settings</h1></div><span className="muted">{membership.role} · {visibleMemberCount} member{visibleMemberCount === 1 ? "" : "s"}</span></div>
      {notice && <div className="section-card">{notice}</div>}
      <div className="settings-grid">
        <div className="section-card"><h3><Copy size={16} /> Install messenger</h3><p className="muted">Paste this before the closing body tag on any site.</p><pre className="code-block">{snippet}</pre><button className="chip" onClick={() => navigator.clipboard.writeText(snippet)}>Copy snippet</button></div>
        <div className="section-card"><h3><Mail size={16} /> Email inbox</h3><p>Forward support mail to:</p><pre className="code-block">{inboundAddress || "Created automatically after workspace setup"}</pre><p className="muted">Inbound delivery requires the configured email provider webhook.</p></div>
        <div className="section-card"><h3><UserPlus size={16} /> Invite teammate</h3><label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="agent@company.com" /></label><label>Role<select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as "admin" | "agent")}><option value="agent">Agent</option><option value="admin">Admin</option></select></label><button className="primary-button" disabled={teamBusy || !email.trim()} onClick={invite}>Send invite</button>{invitations.length > 0 && <div><h4>Pending invitations</h4>{invitations.map((item) => <p key={item.id} className="muted">{item.email} · {item.role} · expires {new Date(item.expires_at).toLocaleDateString()}</p>)}</div>}</div>
        <div className="section-card"><h3><Users size={16} /> Team</h3>{members.map((member) => <div key={member.id} className="team-row"><div><strong>{member.name || member.email || "Team member"}</strong><p className="muted">{member.email || "No email"}</p></div><select disabled={membership.role !== "admin" || teamBusy} value={member.role} onChange={(event) => void changeMember(member.id, event.target.value as "admin" | "agent")}><option value="admin">Admin</option><option value="agent">Agent</option></select>{membership.role === "admin" && member.id !== membership.id && <button className="chip" disabled={teamBusy} onClick={() => void removeMember(member.id)}><Trash2 size={14} /> Remove</button>}</div>)}{!members.length && <p className="muted">Loading team…</p>}</div>
        <CannedResponsesManager />
        <WebhooksManager isAdmin={membership.role === "admin"} />
        <div className="section-card"><h3><Globe2 size={16} /> Custom help domain</h3><label>Hostname<input value={hostname} onChange={(event) => setHostname(event.target.value)} placeholder="help.company.com" /></label><button className="primary-button" onClick={addDomain}>Add domain</button>{domains.map((domain) => <div key={domain.id} className="section-card"><strong>{domain.hostname}</strong><p className="muted">TXT _relaydesk.{domain.hostname} = {domain.verification_token}</p><button className="chip" onClick={() => verify(domain)}>{domain.status === "verified" ? <><Check size={14} /> Verified</> : "Verify DNS"}</button></div>)}</div>
      </div>
    </section>
  );
}
