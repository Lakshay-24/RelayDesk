"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const SUPABASE_URL=process.env.NEXT_PUBLIC_SUPABASE_URL!;

export default function AccountSecurity({email}:{email:string}){
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");

  async function authToken(){
    const supabase=createClient();
    const {data}=await supabase.auth.getSession();
    if(!data.session) throw new Error("Session expired");
    return data.session.access_token;
  }

  async function deleteAccount(){
    const confirmation=window.prompt('Type DELETE RELAYDESK ACCOUNT to permanently delete your RelayDesk account.');
    if(confirmation!=="DELETE RELAYDESK ACCOUNT") return;
    setBusy(true);setMessage("");
    try{
      const token=await authToken();
      const response=await fetch(`${SUPABASE_URL}/functions/v1/account-manage`,{
        method:"POST",
        headers:{authorization:`Bearer ${token}`,"content-type":"application/json"},
        body:JSON.stringify({action:"delete_account",confirmation})
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(data.message??data.error??"Account deletion failed");
      const supabase=createClient();
      await supabase.auth.signOut();
      window.location.href="/";
    }catch(e){
      setMessage(e instanceof Error?e.message:"Account deletion failed");
    }finally{setBusy(false)}
  }

  return <section className="panel" id="account-security">
    <div className="panel-title"><div><h2>Account & security</h2><p className="small">Manage your RelayDesk identity and account lifecycle.</p></div></div>
    <div className="connection-grid">
      <div><strong>Email</strong><p className="small">{email}</p></div>
      <div><strong>Password</strong><p className="small"><Link href="/auth/reset-password">Change password</Link> or use the recovery flow if you cannot sign in.</p></div>
      <div><strong>Email verification</strong><p className="small">Confirmation and reset links are handled by RelayDesk Auth. Sign up again or use resend confirmation if needed.</p></div>
      <div><strong>Permanent deletion</strong><p className="small">Deleting your account revokes paired-device access and personal MCP tokens. Active paid subscriptions must be cancelled first.</p></div>
    </div>
    {message&&<p className="notice">{message}</p>}
    <div className="actions"><button className="danger-link" type="button" disabled={busy} onClick={deleteAccount}>{busy?"Deleting…":"Delete RelayDesk account"}</button></div>
  </section>;
}
