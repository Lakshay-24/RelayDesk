"use client";

import { useEffect,useState } from "react";
import { MessageSquareText,Plus,Trash2 } from "lucide-react";
import type { CannedResponse } from "@/types/domain";

type Notice={tone:"success"|"error"|"info";text:string}|null;

export function CannedResponsesManager(){
 const [responses,setResponses]=useState<CannedResponse[]>([]);
 const [title,setTitle]=useState("");
 const [body,setBody]=useState("");
 const [tags,setTags]=useState("");
 const [action,setAction]=useState("");
 const [notice,setNotice]=useState<Notice>(null);
 const busy=Boolean(action);

 async function load(){
  try{const response=await fetch("/api/canned-responses",{cache:"no-store"});const json=await response.json().catch(()=>({}));if(!response.ok)throw new Error(json.error??"Could not load saved replies");setResponses(json.responses??[]);}catch(error){setNotice({tone:"error",text:error instanceof Error?error.message:"Could not load saved replies"});}
 }
 useEffect(()=>{void load();},[]);

 async function createResponse(){
  if(!title.trim()||!body.trim()||busy)return;
  setAction("create");setNotice({tone:"info",text:"Saving reply…"});
  try{
   const response=await fetch("/api/canned-responses",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({title:title.trim(),body:body.trim(),tags:tags.split(",").map(tag=>tag.trim()).filter(Boolean)})});
   const json=await response.json().catch(()=>({}));if(!response.ok)throw new Error(json.error??"Could not save reply");
   setResponses(current=>[...current,json.response].sort((a,b)=>a.title.localeCompare(b.title)));setTitle("");setBody("");setTags("");setNotice({tone:"success",text:"Saved reply created"});
  }catch(error){setNotice({tone:"error",text:error instanceof Error?error.message:"Could not save reply"});}
  finally{setAction("");}
 }

 async function deleteResponse(id:string){
  if(busy)return;
  setAction(`delete-${id}`);setNotice({tone:"info",text:"Deleting saved reply…"});
  try{const response=await fetch("/api/canned-responses",{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({id})});const json=await response.json().catch(()=>({}));if(!response.ok)throw new Error(json.error??"Could not delete reply");setResponses(current=>current.filter(item=>item.id!==id));setNotice({tone:"success",text:"Saved reply deleted"});}
  catch(error){setNotice({tone:"error",text:error instanceof Error?error.message:"Could not delete reply"});}
  finally{setAction("");}
 }

 return <div className="section-card">
  <h3><MessageSquareText size={16}/>Saved replies</h3>
  <p className="muted">Create reusable responses that agents can insert from the inbox composer.</p>
  {notice&&<div className={notice.tone==="error"?"form-error":notice.tone==="success"?"form-success":"muted"} role="status" aria-live="polite">{notice.text}</div>}
  <label>Name<input disabled={busy} value={title} onChange={event=>setTitle(event.target.value)} placeholder="Refund policy"/></label>
  <label>Reply<textarea disabled={busy} value={body} onChange={event=>setBody(event.target.value)} placeholder="Thanks for reaching out…"/></label>
  <label>Tags<input disabled={busy} value={tags} onChange={event=>setTags(event.target.value)} placeholder="billing, refund"/></label>
  <button className="primary-button" aria-busy={action==="create"} disabled={busy||!title.trim()||!body.trim()} onClick={createResponse}><Plus size={14}/>{action==="create"?"Saving reply…":"Add saved reply"}</button>
  <div>{responses.map(item=><div className="team-row" key={item.id}><div><strong>{item.title}</strong><p className="muted">{item.body.length>100?`${item.body.slice(0,100)}…`:item.body}</p>{item.tags.length>0&&<small>{item.tags.join(" · ")}</small>}</div><button className="chip" aria-busy={action===`delete-${item.id}`} disabled={busy} onClick={()=>void deleteResponse(item.id)}><Trash2 size={14}/>{action===`delete-${item.id}`?"Deleting…":"Delete"}</button></div>)}{!responses.length&&<p className="muted">No saved replies yet.</p>}</div>
 </div>;
}
