"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, MessageSquareText, Sparkles, Users } from "lucide-react";

type PendingInvitation={id:string;workspaceId:string;workspaceName:string;workspaceSlug:string|null;role:"admin"|"agent";expiresAt:string;createdAt:string};

function normalizeSlug(value:string){return value.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,50)}

export default function OnboardingPage(){
 const router=useRouter();
 const [name,setName]=useState("");const [slug,setSlug]=useState("");const [slugEdited,setSlugEdited]=useState(false);
 const [error,setError]=useState("");const [busy,setBusy]=useState(false);const [status,setStatus]=useState("");
 const [loadingInvites,setLoadingInvites]=useState(true);const [invitations,setInvitations]=useState<PendingInvitation[]>([]);const [inviteAction,setInviteAction]=useState("");

 useEffect(()=>{router.prefetch("/inbox");void loadInvitations()},[router]);

 async function loadInvitations(){
  setLoadingInvites(true);
  try{const response=await fetch("/api/team/pending",{cache:"no-store"});const json=await response.json().catch(()=>({}));if(!response.ok)throw new Error(json.error??"Could not check invitations");setInvitations(json.invitations??[])}
  catch(caught){setError(caught instanceof Error?caught.message:"Could not check invitations")}
  finally{setLoadingInvites(false)}
 }

 async function handleInvitation(invitationId:string,action:"accept"|"decline"){
  if(inviteAction)return;setInviteAction(`${action}:${invitationId}`);setError("");setStatus(action==="accept"?"Joining workspace…":"Declining invitation…");
  try{const response=await fetch("/api/team/pending",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({invitationId,action})});const json=await response.json().catch(()=>({}));if(!response.ok)throw new Error(json.error??"Could not update invitation");if(action==="accept"){setStatus("Workspace joined. Opening inbox…");router.replace("/inbox");router.refresh();return}setInvitations(current=>current.filter(item=>item.id!==invitationId));setStatus("Invitation declined. You can now create your own workspace.")}
  catch(caught){setError(caught instanceof Error?caught.message:"Could not update invitation");setStatus("")}
  finally{setInviteAction("")}
 }

 async function submit(event:React.FormEvent){
  event.preventDefault();if(busy||loadingInvites||invitations.length)return;
  const cleanName=name.trim(),cleanSlug=normalizeSlug(slug);
  if(cleanName.length<2)return setError("Enter a workspace name with at least 2 characters.");
  if(cleanSlug.length<2)return setError("Enter a workspace URL with at least 2 letters or numbers.");
  setBusy(true);setError("");setStatus("Creating your workspace and support inbox…");
  const timeout=window.setTimeout(()=>setStatus("Still setting things up securely…"),5000);
  try{const controller=new AbortController();const abort=window.setTimeout(()=>controller.abort(),30000);const response=await fetch("/api/workspaces/bootstrap",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name:cleanName,slug:cleanSlug}),signal:controller.signal});window.clearTimeout(abort);const json=await response.json().catch(()=>({}));if(!response.ok)throw new Error(json.error??"Could not create workspace. Please try again.");setStatus("Workspace created. Opening your inbox…");router.replace("/inbox");router.refresh()}
  catch(caught){setError(caught instanceof DOMException&&caught.name==="AbortError"?"Workspace setup took too long. Please retry.":caught instanceof Error?caught.message:"Could not reach RelayDesk.");setStatus("")}
  finally{window.clearTimeout(timeout);setBusy(false)}
 }

 return <main className="onboarding-page">
  <section className="onboarding-copy"><span className="brand-mark"><MessageSquareText size={20}/></span><p className="eyebrow">Welcome to RelayDesk</p><h1>One place to support every customer.</h1><p>Join an invited team or create a workspace for live chat, email, knowledge and AI assistance.</p><div className="onboarding-points"><span><Check size={16}/> Realtime website messenger</span><span><Users size={16}/> Admin and agent collaboration</span><span><Sparkles size={16}/> AI summaries and article suggestions</span></div></section>
  <section className="onboarding-card">
   {loadingInvites?<><span className="step-label">Checking your account</span><h2>Looking for team invitations…</h2><p className="muted">This prevents you from accidentally creating a separate workspace.</p></>:invitations.length?<><span className="step-label">Invitation found</span><h2>Join your team</h2><p className="muted">An admin invited this email address to an existing RelayDesk workspace.</p>{invitations.map(invite=><div className="section-card" key={invite.id}><h3>{invite.workspaceName}</h3><p className="muted">Role: {invite.role} · expires {new Date(invite.expiresAt).toLocaleDateString()}</p><div className="filters"><button className="primary-button" disabled={Boolean(inviteAction)} onClick={()=>handleInvitation(invite.id,"accept")}>{inviteAction===`accept:${invite.id}`?"Joining…":"Accept and join"}</button><button className="chip" disabled={Boolean(inviteAction)} onClick={()=>handleInvitation(invite.id,"decline")}>{inviteAction===`decline:${invite.id}`?"Declining…":"Decline"}</button></div></div>)}</>:<form onSubmit={submit} noValidate><span className="step-label">Step 1 of 3</span><h2>Create your workspace</h2><p className="muted">No pending team invitation was found for this account.</p><label>Workspace name<input disabled={busy} value={name} onChange={event=>{const next=event.target.value;setName(next);if(!slugEdited)setSlug(normalizeSlug(next))}} placeholder="Acme Support" autoComplete="organization" autoFocus/></label><label>Workspace URL<div className="slug-field"><span>relaydesk.app/</span><input disabled={busy} value={slug} onChange={event=>{setSlugEdited(true);setSlug(normalizeSlug(event.target.value))}} placeholder="acme" inputMode="url"/></div></label><small className="muted">Use lowercase letters, numbers and hyphens.</small><button className="primary-button onboarding-submit" type="submit" disabled={busy}>{busy?"Creating workspace…":<>Create workspace <ArrowRight size={16}/></>}</button></form>}
   {status&&<p className="form-success" role="status">{status}</p>}{error&&<p className="form-error" role="alert">{error}</p>}
  </section>
 </main>
}
