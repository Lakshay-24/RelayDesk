"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, Globe2, Mail, Trash2, UserPlus, Users } from "lucide-react";
import type { Membership, Workspace } from "@/types/domain";
import { ApiAccessManager } from "@/components/settings/api-access-manager";
import { CannedResponsesManager } from "@/components/settings/canned-responses-manager";
import { WebhooksManager } from "@/components/settings/webhooks-manager";
import { WidgetInstallCard } from "@/components/settings/widget-install-card";

type Domain = { id: string; hostname: string; verification_token: string; status: string; verified_at: string | null };
type TeamMember = { id: string; user_id: string; role: "admin" | "agent"; created_at: string; email: string | null; name: string | null };
type Invitation = { id: string; email: string; role: "admin" | "agent"; expires_at: string; accepted_at: string | null; created_at: string; status: "pending" | "accepted" | "expired" };
type Props = { workspace: Workspace; membership: Membership; initialDomains: Domain[]; inboundAddress: string | null; inboundConnected: boolean; memberCount: number };
type Notice = { tone: "success" | "error" | "info"; text: string } | null;

export function SettingsWorkspace({ workspace, membership, initialDomains, inboundAddress, inboundConnected, memberCount }: Props) {
  const [domains, setDomains] = useState(initialDomains);
  const [hostname, setHostname] = useState("");
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "agent">("agent");
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [action, setAction] = useState("");
  const [teamNotice, setTeamNotice] = useState<Notice>(null);
  const [domainNotice, setDomainNotice] = useState<Notice>(null);
  const [inviteNotice, setInviteNotice] = useState<Notice>(null);
  const [pendingOpen, setPendingOpen] = useState(false);

  const isAdmin = membership.role === "admin";
  const appUrl = typeof window !== "undefined" ? window.location.origin : process.env.NEXT_PUBLIC_APP_URL || "https://relay-desk-mjq6.vercel.app";

  async function request(url: string, init?: RequestInit) {
    const response = await fetch(url, init);
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(json.error ?? "Request failed");
    return json;
  }

  async function loadTeam() {
    try {
      const json = await request(`/api/team/members?workspaceId=${workspace.id}`, { cache: "no-store" });
      setMembers(json.members ?? []);
      setInvitations(json.invitations ?? []);
    } catch (error) {
      setTeamNotice({ tone: "error", text: error instanceof Error ? error.message : "Could not load team" });
    }
  }

  useEffect(() => { void loadTeam(); }, [workspace.id]);

  async function run(key: string, work: () => Promise<void>) {
    if (action) return;
    setAction(key);
    try { await work(); }
    finally { setAction(""); }
  }

  async function invite() {
    setInviteNotice({ tone: "info", text: "Sending invitation…" });
    await run("invite", async () => {
      try {
        const json = await request("/api/team/invite", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ workspaceId: workspace.id, email: email.trim(), role: inviteRole }),
        });
        setEmail("");
        await loadTeam();
        setPendingOpen(true);
        setInviteNotice({ tone: "success", text: json.message ?? "Invitation created." });
      } catch (error) {
        setInviteNotice({ tone: "error", text: error instanceof Error ? error.message : "Could not send invitation" });
      }
    });
  }

  async function revokeInvitation(invitation: Invitation) {
    if (!window.confirm(`Revoke the invitation sent to ${invitation.email}?`)) return;
    setInviteNotice({ tone: "info", text: "Revoking invitation…" });
    await run(`invite-${invitation.id}`, async () => {
      try {
        const json = await request("/api/team/invite", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ workspaceId: workspace.id, invitationId: invitation.id }),
        });
        setInvitations(current => current.filter(item => item.id !== invitation.id));
        setInviteNotice({ tone: "success", text: json.message ?? "Invitation revoked." });
      } catch (error) {
        setInviteNotice({ tone: "error", text: error instanceof Error ? error.message : "Could not revoke invitation" });
      }
    });
  }

  async function changeRole(member: TeamMember, role: "admin" | "agent") {
    if (member.id === membership.id) return;
    const previous = members;
    setMembers(current => current.map(item => item.id === member.id ? { ...item, role } : item));
    setTeamNotice({ tone: "info", text: "Updating member…" });
    await run(`member-${member.id}`, async () => {
      try {
        await request("/api/team/members", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ workspaceId: workspace.id, membershipId: member.id, role, action: "update" }),
        });
        setTeamNotice({ tone: "success", text: "Member role updated." });
      } catch (error) {
        setMembers(previous);
        setTeamNotice({ tone: "error", text: error instanceof Error ? error.message : "Could not update role" });
      }
    });
  }

  async function removeMember(member: TeamMember) {
    if (member.id === membership.id) return;
    if (!window.confirm(`Remove ${member.name || member.email || "this member"}?`)) return;
    setTeamNotice({ tone: "info", text: "Removing member…" });
    await run(`member-${member.id}`, async () => {
      try {
        await request("/api/team/members", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ workspaceId: workspace.id, membershipId: member.id, action: "remove" }),
        });
        setMembers(current => current.filter(item => item.id !== member.id));
        setTeamNotice({ tone: "success", text: "Member removed." });
      } catch (error) {
        setTeamNotice({ tone: "error", text: error instanceof Error ? error.message : "Could not remove member" });
      }
    });
  }

  async function addDomain() {
    setDomainNotice({ tone: "info", text: "Connecting domain…" });
    await run("domain", async () => {
      try {
        const json = await request("/api/domains", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ workspaceId: workspace.id, hostname }),
        });
        setDomains(current => [...current, json.domain]);
        setHostname("");
        setDomainNotice({ tone: "success", text: json.message ?? "Domain saved." });
      } catch (error) {
        setDomainNotice({ tone: "error", text: error instanceof Error ? error.message : "Could not connect domain" });
      }
    });
  }

  const adminCount = members.filter(member => member.role === "admin").length;
  const pendingInvitations = useMemo(() => invitations.filter(invite => invite.status === "pending"), [invitations]);
  const visibleCount = members.length || memberCount;
  const banner = (value: Notice) => value ? <p className={`inline-notice ${value.tone}`}>{value.text}</p> : null;

  return <section className="settings-page">
    <div className="page-title-row">
      <div><p className="eyebrow">{workspace.name}</p><h1>Settings</h1></div>
      <span className="muted">{membership.role} · {visibleCount} member{visibleCount === 1 ? "" : "s"}</span>
    </div>

    <div className="settings-grid">
      <WidgetInstallCard appUrl={appUrl} workspaceKey={workspace.public_key} onNotice={text => setInviteNotice({ tone: "success", text })} />

      <div className="section-card email-card">
        <h3><Mail size={17} />Email inbox</h3>
        <p className="muted">Receive customer emails in the same shared inbox as website conversations.</p>
        {!inboundConnected ? <div className="setup warning"><AlertTriangle size={17} /><div><strong>Email setup incomplete</strong><p>The receiving service is not configured yet.</p></div></div> : null}
        <p className="field-caption">Workspace support address</p>
        <pre className="code-block">{inboundAddress || "Not generated"}</pre>
      </div>

      <div className="section-card invite-card">
        <h3><UserPlus size={17} />Invite teammate</h3>
        {banner(inviteNotice)}
        <label>Email<input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="agent@company.com" disabled={!isAdmin || Boolean(action)} /></label>
        <label>Role<select value={inviteRole} onChange={event => setInviteRole(event.target.value as "admin" | "agent")} disabled={!isAdmin || Boolean(action)}><option value="agent">Agent</option><option value="admin">Admin</option></select></label>
        <button className="primary-button" disabled={!isAdmin || Boolean(action) || !email.trim()} onClick={() => void invite()}>{action === "invite" ? "Sending…" : "Send invite"}</button>

        <div className="pending-wrap">
          <button type="button" className="pending-toggle" aria-expanded={pendingOpen} onClick={() => setPendingOpen(open => !open)}>
            <span><strong>Pending invitations</strong><small>{pendingInvitations.length}</small></span>
            <ChevronDown size={17} className={pendingOpen ? "rotated" : ""} />
          </button>
          {pendingOpen ? <div className="pending-list">
            {pendingInvitations.length ? pendingInvitations.map(invite => <div className="pending-row" key={invite.id}>
              <div><strong>{invite.email}</strong><p>{invite.role} · expires {new Date(invite.expires_at).toLocaleDateString()}</p></div>
              <button type="button" className="revoke-button" disabled={!isAdmin || Boolean(action)} onClick={() => void revokeInvitation(invite)}>{action === `invite-${invite.id}` ? "Revoking…" : "Revoke"}</button>
            </div>) : <p className="muted pending-empty">No pending invitations.</p>}
          </div> : null}
        </div>
      </div>

      <div className="section-card">
        <h3><Users size={17} />Team</h3>
        {banner(teamNotice)}
        {members.map(member => {
          const self = member.id === membership.id;
          const onlyAdmin = member.role === "admin" && adminCount <= 1;
          return <div className="team-row" key={member.id}>
            <div><strong>{member.name || member.email || "Team member"}{self ? " (you)" : ""}</strong><p className="muted">{member.email || "No email"}{onlyAdmin ? " · only admin" : ""}</p></div>
            <select value={member.role} disabled={!isAdmin || Boolean(action) || self || onlyAdmin} title={self ? "Use the Workspaces page to leave this workspace" : onlyAdmin ? "Promote another admin first" : "Change role"} onChange={event => void changeRole(member, event.target.value as "admin" | "agent")}><option value="admin">Admin</option><option value="agent">Agent</option></select>
            {isAdmin && !self ? <button className="chip danger-chip" disabled={Boolean(action) || onlyAdmin} onClick={() => void removeMember(member)}><Trash2 size={14} />Remove</button> : null}
          </div>;
        })}
        <p className="muted">Your own role cannot be changed here. Use <strong>Switch → Workspaces → Leave</strong> to leave explicitly.</p>
      </div>

      <CannedResponsesManager />
      <WebhooksManager isAdmin={isAdmin} />
      <ApiAccessManager isAdmin={isAdmin} />

      <div className="section-card domain-card">
        <h3><Globe2 size={17} />Custom help domain</h3>
        {banner(domainNotice)}
        <label>Hostname<input value={hostname} onChange={event => setHostname(event.target.value.toLowerCase().trim())} placeholder="help.company.com" /></label>
        <button className="primary-button" disabled={!isAdmin || Boolean(action) || !hostname} onClick={() => void addDomain()}>{action === "domain" ? "Connecting…" : "Connect domain"}</button>
        {domains.map(domain => <div className="domain-row" key={domain.id}><strong>{domain.hostname}</strong><span>{domain.status}</span></div>)}
      </div>
    </div>

    <style jsx>{`
      .setup{display:flex;gap:10px;padding:12px;border-radius:12px;margin:12px 0}.setup.warning{background:#fff9df;border:1px solid #f2c94c}.setup p{margin:3px 0 0}
      .field-caption{margin:16px 0 8px;color:#777}.inline-notice{margin:0 0 14px;padding:10px 12px;border-radius:10px;font-size:14px}.inline-notice.error{background:#fff1f0;color:#b42318;border:1px solid #ffc9c5}.inline-notice.success{background:#edf9ef;color:#18712b;border:1px solid #b8e2c0}.inline-notice.info{background:#f4f4f1;color:#666;border:1px solid #e2e2dc}
      .team-row{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:10px;align-items:center;padding:12px 0;border-bottom:1px solid #eee}.team-row p{margin:4px 0 0}.domain-row{display:flex;justify-content:space-between;padding:10px 0;border-top:1px solid #eee}
      .pending-wrap{margin-top:18px;border-top:1px solid #ecece7;padding-top:12px}.pending-toggle{width:100%;display:flex;align-items:center;justify-content:space-between;border:0;background:transparent;padding:8px 0;color:#202020;cursor:pointer}.pending-toggle span{display:flex;align-items:center;gap:8px}.pending-toggle small{display:grid;place-items:center;min-width:23px;height:23px;padding:0 7px;border-radius:999px;background:#f0f1f3;color:#60646c;font-weight:800}.pending-toggle :global(svg){transition:transform .16s ease}.pending-toggle :global(svg.rotated){transform:rotate(180deg)}
      .pending-list{display:grid;margin-top:4px;border:1px solid #e5e5df;border-radius:12px;overflow:hidden}.pending-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 13px;border-bottom:1px solid #ecece7}.pending-row:last-child{border-bottom:0}.pending-row strong{display:block;overflow-wrap:anywhere}.pending-row p{margin:4px 0 0;color:#777;font-size:13px;text-transform:capitalize}.revoke-button{min-height:34px;padding:7px 10px;border:1px solid #e2b8b4;border-radius:9px;background:#fff;color:#a52a22;font-weight:750;cursor:pointer}.pending-empty{margin:0;padding:14px}.invite-card label{margin-top:12px}.invite-card>.primary-button{margin-top:14px}
      @media(max-width:700px){.team-row{grid-template-columns:1fr}.team-row select,.team-row button{width:100%}.pending-row{align-items:flex-start;flex-direction:column}.revoke-button{width:100%}}
    `}</style>
  </section>;
}
