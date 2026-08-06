"use client";

import { useEffect, useState } from "react";
import { Check, Globe2, Mail, Trash2, UserPlus, Users } from "lucide-react";
import type { Membership, Workspace } from "@/types/domain";
import { ApiAccessManager } from "@/components/settings/api-access-manager";
import { CannedResponsesManager } from "@/components/settings/canned-responses-manager";
import { DiagnosticsManager } from "@/components/settings/diagnostics-manager";
import { WebhooksManager } from "@/components/settings/webhooks-manager";
import { WidgetInstallCard } from "@/components/settings/widget-install-card";

type Domain={id:string;hostname:string;verification_token:string;status:string;verified_at:string|null};
type TeamMember={id:string;user_id:string;role:"admin"|"agent";created_at:string;email:string|null;name:string|null};
type Invitation={id:string;email:string;role:"admin"|"agent";expires_at:string;accepted_at:string|null;created_at:string};
type Props={workspace:Workspace;membership:Membership;initialDomains:Domain[];inboundAddress:string|null;memberCount:number};
type Notice={tone:"success"|"error"|"info";text:string}|null;

export function SettingsWorkspace({workspace,membership,initialDomains,inboundAddress,memberCount}:Props){
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
    if(!response.ok)throw new Error(json.error??"Request failed");
    return json;
  }

  async function loadTeam(){
    try{
      const json=await jsonRequest("/api/team/members",{cache:"no-store"});
      setMembers(json.members??[]);
      setInvitations(json.invitations??[]);
    }catch(error){
      setNotice({tone:"error",text:error instanceof Error?error.message:"Could not load team"});
    }
  }

  useEffect(()=>{void loadTeam();},[]);

  async function run(key:string,work:()=>Promise<void>){
    if(action)return;
    setAction(key);
    setNotice({tone:"info",text:"Working…"});
    try{await work();}
    catch(error){setNotice({tone:"error",text:error instanceof Error?error.message:"Something went wrong"});}
    finally{setAction("");}
  }

  function invite(){
    void run("invite",async()=>{
      const json=await jsonRequest("/api/team/invite",{
        method:"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({workspaceId:workspace.id,email:email.trim(),role:inviteRole}),
      });
      setEmail("");
      await loadTeam();
      setNotice({tone:"success",text:json.message??"Supabase accepted the invitation email. Ask the recipient to check Inbox and Spam."});
    });
  }

  function changeMember(membershipId:string,role:"admin"|"agent"){
    void run(`member-${membershipId}`,async()=>{
      const previous=members;
      setMembers(current=>current.map(member=>member.id===membershipId?{...member,role}:member));
      try{
        await jsonRequest("/api/team/members",{
          method:"PATCH",
          headers:{"content-type":"application/json"},
          body:JSON.stringify({membershipId,role,action:"update"}),
        });
        setNotice({tone:"success",text:"Member role updated"});
      }catch(error){
        setMembers(previous);
        throw error;
      }
    });
  }

  function removeMember(membershipId:string){
    void run(`member-${membershipId}`,async()=>{
      await jsonRequest("/api/team/members",{
        method:"PATCH",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({membershipId,action:"remove"}),
      });
      setMembers(current=>current.filter(member=>member.id!==membershipId));
      setNotice({tone:"success",text:"Member removed"});
    });
  }

  function addDomain(){
    void run("domain-new",async()=>{
      const json=await jsonRequest("/api/domains",{
        method:"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({workspaceId:workspace.id,hostname}),
      });
      setDomains(current=>[...current,json.domain]);
      setHostname("");
      setNotice({tone:"success",text:"Domain added. Create the TXT and CNAME records shown below."});
    });
  }

  function verify(domain:Domain){
    void run(`domain-${domain.id}`,async()=>{
      try{
        const json=await jsonRequest("/api/domains",{
          method:"PATCH",
          headers:{"content-type":"application/json"},
          body:JSON.stringify({workspaceId:workspace.id,domainId:domain.id}),
        });
        setDomains(current=>current.map(item=>item.id===domain.id?json.domain:item));
        setNotice({tone:"success",text:"Domain ownership verified. Complete Vercel registration and SSL provisioning next."});
      }catch(error){
        setDomains(current=>current.map(item=>item.id===domain.id?{...item,status:"failed"}:item));
        throw error;
      }
    });
  }

  function removeDomain(domain:Domain){
    if(!window.confirm(`Remove ${domain.hostname} from RelayDesk?`))return;
    void run(`domain-${domain.id}`,async()=>{
      await jsonRequest("/api/domains",{
        method:"DELETE",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({workspaceId:workspace.id,domainId:domain.id}),
      });
      setDomains(current=>current.filter(item=>item.id!==domain.id));
      setNotice({tone:"success",text:"Domain removed from RelayDesk."});
    });
  }

  const visibleMemberCount=members.length||memberCount;

  return <section className="settings-page">
    <div className="page-title-row">
      <div><p className="eyebrow">{workspace.name}</p><h1>Settings</h1></div>
      <span className="muted">{membership.role} · {visibleMemberCount} member{visibleMemberCount===1?"":"s"}</span>
    </div>

    {notice&&<div className={`notice-banner ${notice.tone==="error"?"form-error":notice.tone==="success"?"form-success":""}`} role="status" aria-live="polite">{notice.text}</div>}

    <DiagnosticsManager isAdmin={isAdmin}/>

    <div className="settings-grid">
      <WidgetInstallCard appUrl={appUrl} workspaceKey={workspace.public_key} onNotice={(text)=>setNotice({tone:"success",text})}/>

      <div className="section-card">
        <h3><Mail size={16}/>Email inbox</h3>
        <p>Forward support mail to:</p>
        <pre className="code-block">{inboundAddress||"Created automatically after workspace setup"}</pre>
        <p className="muted">Authentication SMTP only sends login and invitation emails. Receiving customer support email still requires the configured inbound provider webhook.</p>
        <p className="muted">Generic webhook: <code>/api/inbound/email</code>. Native Resend receiving: <code>/api/inbound/resend</code>. Delivery events: <code>/api/email/events</code>.</p>
      </div>

      <div className="section-card">
        <h3><UserPlus size={16}/>Invite teammate</h3>
        <p className="muted">RelayDesk asks Supabase Auth to send this through your configured SMTP provider.</p>
        <label>Email<input type="email" value={email} disabled={busy("invite")} onChange={event=>setEmail(event.target.value)} placeholder="agent@company.com"/></label>
        <label>Role<select value={inviteRole} disabled={busy("invite")} onChange={event=>setInviteRole(event.target.value as "admin"|"agent")}><option value="agent">Agent</option><option value="admin">Admin</option></select></label>
        <button className="primary-button" aria-busy={busy("invite")} disabled={Boolean(action)||!email.trim()} onClick={invite}>{busy("invite")?"Sending invite…":"Send invite"}</button>
        <p className="muted">A success message means Supabase accepted the send request. Check Spam if Gmail delays delivery.</p>
        {invitations.length>0&&<div><h4>Pending invitations</h4>{invitations.map(item=><p key={item.id} className="muted">{item.email} · {item.role} · expires {new Date(item.expires_at).toLocaleDateString()}</p>)}</div>}
      </div>

      <div className="section-card">
        <h3><Users size={16}/>Team</h3>
        {members.map(member=><div key={member.id} className="team-row">
          <div><strong>{member.name||member.email||"Team member"}</strong><p className="muted">{member.email||"No email"}</p></div>
          <select disabled={!isAdmin||Boolean(action)} value={member.role} onChange={event=>changeMember(member.id,event.target.value as "admin"|"agent")}><option value="admin">Admin</option><option value="agent">Agent</option></select>
          {isAdmin&&member.id!==membership.id&&<button className="chip" aria-busy={busy(`member-${member.id}`)} disabled={Boolean(action)} onClick={()=>removeMember(member.id)}><Trash2 size={14}/>{busy(`member-${member.id}`)?"Removing…":"Remove"}</button>}
        </div>)}
        {!members.length&&<p className="muted">Loading team…</p>}
      </div>

      <CannedResponsesManager/>
      <WebhooksManager isAdmin={isAdmin}/>
      <ApiAccessManager isAdmin={isAdmin}/>

      <div className="section-card">
        <h3><Globe2 size={16}/>Custom help domain</h3>
        <label>Hostname<input value={hostname} disabled={busy("domain-new")} onChange={event=>setHostname(event.target.value.toLowerCase().trim())} placeholder="help.company.com"/></label>
        <button className="primary-button" aria-busy={busy("domain-new")} disabled={!isAdmin||Boolean(action)||!hostname.trim()} onClick={addDomain}>{busy("domain-new")?"Adding domain…":"Add domain"}</button>
        {domains.map(domain=><div key={domain.id} className="section-card">
          <strong>{domain.hostname}</strong>
          <p className="muted">Status: {domain.status}</p>
          <p className="muted">TXT _relaydesk.{domain.hostname} = {domain.verification_token}</p>
          <p className="muted">CNAME {domain.hostname} = {process.env.NEXT_PUBLIC_CUSTOM_DOMAIN_CNAME_TARGET||"cname.vercel-dns.com"}</p>
          <div className="filters">
            <button className="chip" aria-busy={busy(`domain-${domain.id}`)} disabled={Boolean(action)||domain.status==="verified"} onClick={()=>verify(domain)}>{domain.status==="verified"?<><Check size={14}/>Verified</>:busy(`domain-${domain.id}`)?"Checking DNS…":domain.status==="failed"?"Retry DNS":"Verify DNS"}</button>
            <button className="chip danger-chip" disabled={Boolean(action)||!isAdmin} onClick={()=>removeDomain(domain)}><Trash2 size={14}/>{busy(`domain-${domain.id}`)?"Removing…":"Remove"}</button>
          </div>
        </div>)}
      </div>
    </div>
  </section>;
}
