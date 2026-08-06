"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Check, CheckCircle2, Globe2, Mail, ShieldCheck, Trash2, UserPlus, Users } from "lucide-react";
import type { Membership, Workspace } from "@/types/domain";
import { ApiAccessManager } from "@/components/settings/api-access-manager";
import { CannedResponsesManager } from "@/components/settings/canned-responses-manager";
import { DiagnosticsManager } from "@/components/settings/diagnostics-manager";
import { WebhooksManager } from "@/components/settings/webhooks-manager";
import { WidgetInstallCard } from "@/components/settings/widget-install-card";

type Domain={id:string;hostname:string;verification_token:string;status:string;verified_at:string|null};
type TeamMember={id:string;user_id:string;role:"admin"|"agent";created_at:string;email:string|null;name:string|null;status?:"active"};
type Invitation={id:string;email:string;role:"admin"|"agent";expires_at:string;accepted_at:string|null;created_at:string;status:"pending"|"accepted"|"expired"};
type Props={workspace:Workspace;membership:Membership;initialDomains:Domain[];inboundAddress:string|null;inboundConnected:boolean;memberCount:number};
type Notice={tone:"success"|"error"|"info";text:string}|null;

export function SettingsWorkspace({workspace,membership,initialDomains,inboundAddress,inboundConnected,memberCount}:Props){
  const [domains,setDomains]=useState(initialDomains);
  const [hostname,setHostname]=useState("");
  const [email,setEmail]=useState("");
  const [inviteRole,setInviteRole]=useState<"admin"|"agent">("agent");
  const [notice,setNotice]=useState<Notice>(null);
  const [members,setMembers]=useState<TeamMember[]>([]);
  const [invitations,setInvitations]=useState<Invitation[]>([]);
  const [action,setAction]=useState("");
  const isAdmin=membership.role==="admin";
  const appUrl=typeof window!=="undefined"?window.location.origin:process.env.NEXT_PUBLIC_APP_URL||"https://relay-desk-mjq6.vercel.app";
  const busy=(key:string)=>action===key;

  async function jsonRequest(url:string,init?:RequestInit){
    const response=await fetch(url,init);
    const json=await response.json().catch(()=>({}));
    if(!response.ok){const error=new Error(json.error??"Request failed") as Error&{pending?:boolean};error.pending=Boolean(json.pending);throw error;}
    return json;
  }

  async function loadTeam(){
    try{const json=await jsonRequest(`/api/team/members?workspaceId=${encodeURIComponent(workspace.id)}`,{cache:"no-store"});setMembers(json.members??[]);setInvitations(json.invitations??[]);}
    catch(error){setNotice({tone:"error",text:error instanceof Error?error.message:"Could not load team"});}
  }
  useEffect(()=>{void loadTeam();},[workspace.id]);

  async function run(key:string,work:()=>Promise<void>){
    if(action)return;
    setAction(key);setNotice({tone:"info",text:"Working…"});
    try{await work();}catch(error){setNotice({tone:"error",text:error instanceof Error?error.message:"Something went wrong"});}
    finally{setAction("");}
  }

  function invite(){void run("invite",async()=>{
    const json=await jsonRequest("/api/team/invite",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({workspaceId:workspace.id,email:email.trim(),role:inviteRole})});
    setEmail("");await loadTeam();setNotice({tone:"success",text:json.message??"Invitation created."});
  });}

  function changeMember(membershipId:string,role:"admin"|"agent"){void run(`member-${membershipId}`,async()=>{
    const previous=members;setMembers(current=>current.map(member=>member.id===membershipId?{...member,role}:member));
    try{const json=await jsonRequest("/api/team/members",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({workspaceId:workspace.id,membershipId,role,action:"update"})});setNotice({tone:"success",text:json.unchanged?"Member already has that role.":"Member role updated."});}
    catch(error){setMembers(previous);throw error;}
  });}

  function removeMember(membershipId:string){void run(`member-${membershipId}`,async()=>{
    await jsonRequest("/api/team/members",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({workspaceId:workspace.id,membershipId,action:"remove"})});
    setMembers(current=>current.filter(member=>member.id!==membershipId));setNotice({tone:"success",text:"Member removed."});
  });}

  function addDomain(){void run("domain-new",async()=>{
    const json=await jsonRequest("/api/domains",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({workspaceId:workspace.id,hostname})});
    setDomains(current=>[...current,json.domain]);setHostname("");setNotice({tone:"success",text:json.message??"Domain saved. Add the DNS records shown below."});
  });}

  function verify(domain:Domain){
    if(action)return;
    setAction(`domain-${domain.id}`);setNotice({tone:"info",text:"Checking the public DNS records…"});
    void jsonRequest("/api/domains",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({workspaceId:workspace.id,domainId:domain.id})})
      .then(json=>{setDomains(current=>current.map(item=>item.id===domain.id?json.domain:item));setNotice({tone:"success",text:json.message??"Domain verified and HTTPS activation started."});})
      .catch((error:Error&{pending?:boolean})=>{setDomains(current=>current.map(item=>item.id===domain.id?{...item,status:error.pending?"pending":"failed"}:item));setNotice({tone:error.pending?"info":"error",text:error.message});})
      .finally(()=>setAction(""));
  }

  function removeDomain(domain:Domain){
    if(!window.confirm(`Remove ${domain.hostname} from RelayDesk?`))return;
    void run(`domain-${domain.id}`,async()=>{
      await jsonRequest("/api/domains",{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({workspaceId:workspace.id,domainId:domain.id})});
      setDomains(current=>current.filter(item=>item.id!==domain.id));setNotice({tone:"success",text:"Domain removed from RelayDesk hosting."});
    });
  }

  const visibleMemberCount=members.length||memberCount;
  const pendingInvitations=invitations.filter(item=>item.status==="pending");

  return <section className="settings-page">
    <div className="page-title-row"><div><p className="eyebrow">{workspace.name}</p><h1>Settings</h1></div><span className="muted">{membership.role} · {visibleMemberCount} member{visibleMemberCount===1?"":"s"}</span></div>
    {notice&&<div className={`notice-banner ${notice.tone==="error"?"form-error":notice.tone==="success"?"form-success":""}`} role="status" aria-live="polite">{notice.text}</div>}
    <DiagnosticsManager isAdmin={isAdmin}/>

    <div className="settings-grid">
      <WidgetInstallCard appUrl={appUrl} workspaceKey={workspace.public_key} onNotice={(text)=>setNotice({tone:"success",text})}/>

      <div className="section-card email-setup-card">
        <h3><Mail size={16}/>Email inbox</h3>
        {inboundConnected?<div className="setup-success"><CheckCircle2 size={18}/><div><strong>Email receiving is connected</strong><p>Send a test email to this workspace address. Resend will deliver it into Conversations through the signed inbound webhook.</p></div></div>:<div className="setup-warning"><AlertTriangle size={18}/><div><strong>Email receiving configuration is incomplete</strong><p>Add both <code>RESEND_API_KEY</code> and <code>RESEND_WEBHOOK_SECRET</code> in Vercel, then redeploy.</p></div></div>}
        <p className="muted">Workspace support address</p><pre className="code-block">{inboundAddress||"Not generated"}</pre>
        <p className="muted">Provider webhook: <code>/api/inbound/resend</code>. Incoming email is matched to this workspace by the address prefix and threaded using message headers.</p>
      </div>

      <div className="section-card">
        <h3><UserPlus size={16}/>Invite teammate</h3><p className="muted">A person may belong to multiple RelayDesk workspaces. Existing users receive the invitation inside the workspace switcher even when Supabase does not send another signup email.</p>
        <label>Email<input type="email" value={email} disabled={busy("invite")} onChange={event=>setEmail(event.target.value)} placeholder="agent@company.com"/></label>
        <label>Role<select value={inviteRole} disabled={busy("invite")} onChange={event=>setInviteRole(event.target.value as "admin"|"agent")}><option value="agent">Agent</option><option value="admin">Admin</option></select></label>
        <button className="primary-button" aria-busy={busy("invite")} disabled={Boolean(action)||!email.trim()||!isAdmin} onClick={invite}>{busy("invite")?"Sending invite…":"Send invite"}</button>
        <div className="invite-summary"><span>{pendingInvitations.length} pending</span><span>{invitations.filter(item=>item.status==="accepted").length} accepted</span><span>{invitations.filter(item=>item.status==="expired").length} expired</span></div>
        {invitations.length>0&&<div className="invite-history"><h4>Invitation status</h4>{invitations.map(item=><div key={item.id} className="invite-status-row"><span><strong>{item.email}</strong><small>{item.role} · created {new Date(item.created_at).toLocaleDateString()}</small></span><span className={`status-pill ${item.status}`}>{item.status}</span></div>)}</div>}
      </div>

      <div className="section-card">
        <h3><Users size={16}/>Team</h3>
        {members.map(member=><div key={member.id} className="team-row"><div><strong>{member.name||member.email||"Team member"}</strong><p className="muted">{member.email||"No email"} · <span className="active-member">Active</span></p></div><select disabled={!isAdmin||Boolean(action)} value={member.role} onChange={event=>changeMember(member.id,event.target.value as "admin"|"agent")}><option value="admin">Admin</option><option value="agent">Agent</option></select>{isAdmin&&member.id!==membership.id&&<button className="chip" aria-busy={busy(`member-${member.id}`)} disabled={Boolean(action)} onClick={()=>removeMember(member.id)}><Trash2 size={14}/>{busy(`member-${member.id}`)?"Removing…":"Remove"}</button>}</div>)}
        {!members.length&&<p className="muted">Loading team…</p>}
      </div>

      <CannedResponsesManager/><WebhooksManager isAdmin={isAdmin}/><ApiAccessManager isAdmin={isAdmin}/>

      <div className="section-card">
        <h3><Globe2 size={16}/>Custom help domain</h3>
        <p className="muted">Enter a subdomain, add the exact TXT and CNAME records at your DNS provider, then verify. A missing record remains Pending rather than becoming a system failure.</p>
        <div className="domain-flow"><span>1. Enter subdomain</span><span>2. Add TXT + CNAME</span><span>3. Verify and open HTTPS</span></div>
        <label>Help-centre hostname<input value={hostname} disabled={busy("domain-new")} onChange={event=>setHostname(event.target.value.toLowerCase().trim())} placeholder="help.company.com"/></label>
        <button className="primary-button" aria-busy={busy("domain-new")} disabled={!isAdmin||Boolean(action)||!hostname.trim()} onClick={addDomain}>{busy("domain-new")?"Registering domain…":"Connect domain"}</button>
        {domains.map(domain=><div key={domain.id} className="section-card domain-card">
          <div className="domain-heading"><strong>{domain.hostname}</strong><span className={`domain-status ${domain.status}`}>{domain.status==="pending"?"Pending DNS":domain.status}</span></div>
          <p><strong>Ownership record</strong><br/><code>TXT _relaydesk.{domain.hostname}</code><br/><code>{domain.verification_token}</code></p>
          <p><strong>Traffic record</strong><br/><code>CNAME {domain.hostname}</code><br/><code>{process.env.NEXT_PUBLIC_CUSTOM_DOMAIN_CNAME_TARGET||"cname.vercel-dns.com"}</code></p>
          <p className="muted"><ShieldCheck size={14}/> RelayDesk registers verified hostnames with hosting and HTTPS is provisioned automatically.</p>
          <div className="filters">
            <button className="chip" aria-busy={busy(`domain-${domain.id}`)} disabled={Boolean(action)||domain.status==="verified"} onClick={()=>verify(domain)}>{domain.status==="verified"?<><Check size={14}/>HTTPS ready</>:busy(`domain-${domain.id}`)?"Checking DNS…":"Check DNS"}</button>
            <button className="chip danger-chip" disabled={Boolean(action)||!isAdmin} onClick={()=>removeDomain(domain)}><Trash2 size={14}/>{busy(`domain-${domain.id}`)?"Removing…":"Remove"}</button>
          </div>
        </div>)}
      </div>
    </div>
    <style jsx>{`
      .setup-warning,.setup-success{display:flex;gap:12px;padding:14px;border-radius:12px;margin:12px 0}.setup-warning{border:1px solid #f2c94c;background:#fff9df}.setup-warning svg{color:#9a6700}.setup-success{border:1px solid #8dd89a;background:#edf9ef}.setup-success svg{color:#187b33}.setup-warning svg,.setup-success svg{flex:0 0 auto}.setup-warning p,.setup-success p{margin:4px 0 0;line-height:1.5}.invite-summary{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}.invite-summary span,.status-pill{padding:5px 8px;border-radius:999px;background:#eee;font-size:11px;font-weight:800;text-transform:capitalize}.invite-history{display:grid;gap:8px}.invite-status-row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 0;border-top:1px solid #eee}.invite-status-row span:first-child{display:grid;gap:3px}.invite-status-row small{color:#777}.status-pill.pending{background:#fff7d6;color:#7a5900}.status-pill.accepted{background:#e8f7eb;color:#176b2c}.status-pill.expired{background:#f1f1f1;color:#666}.active-member{color:#176b2c;font-weight:700}.domain-flow{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:14px 0}.domain-flow span{padding:9px;border-radius:9px;background:#f5f5f1;font-size:12px;font-weight:700}.domain-heading{display:flex;justify-content:space-between;align-items:center;gap:12px}.domain-status{padding:4px 8px;border-radius:999px;background:#eee;font-size:11px;font-weight:800;text-transform:uppercase}.domain-status.verified{background:#e8f7eb;color:#176b2c}.domain-status.failed{background:#fff0ee;color:#b42318}.domain-status.pending{background:#fff7d6;color:#7a5900}.domain-card code{overflow-wrap:anywhere}.domain-card .muted{display:flex;align-items:flex-start;gap:6px}@media(max-width:720px){.domain-flow{grid-template-columns:1fr}.invite-status-row{align-items:flex-start;flex-direction:column}}
    `}</style>
  </section>;
}
