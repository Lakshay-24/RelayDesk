"use client";

import { useState } from "react";
import { ArrowDown,ArrowUp,Plus,Save,Trash2 } from "lucide-react";
import type { Workspace } from "@/types/domain";

export type KnowledgeCategory={id:string;name:string;slug:string;position:number};
type Notice={tone:"success"|"error"|"info";text:string}|null;

export function CategoryManager({workspace,categories,onChange,onDelete}:{workspace:Workspace;categories:KnowledgeCategory[];onChange:(categories:KnowledgeCategory[])=>void;onDelete:(id:string)=>void}){
 const [name,setName]=useState("");
 const [editingId,setEditingId]=useState("");
 const [editingName,setEditingName]=useState("");
 const [notice,setNotice]=useState<Notice>(null);
 const [action,setAction]=useState("");
 const busy=Boolean(action);

 async function request(url:string,init:RequestInit){const response=await fetch(url,init);const json=await response.json().catch(()=>({}));if(!response.ok)throw new Error(json.error??"Request failed");return json;}
 async function run(key:string,work:()=>Promise<void>){if(busy)return;setAction(key);setNotice({tone:"info",text:"Working…"});try{await work();}catch(error){setNotice({tone:"error",text:error instanceof Error?error.message:"Something went wrong"});}finally{setAction("");}}

 function createCategory(){void run("create",async()=>{const json=await request("/api/knowledge/categories",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({workspaceId:workspace.id,name})});onChange([...categories,json.category].sort((a,b)=>a.position-b.position));setName("");setNotice({tone:"success",text:"Category created"});});}

 function renameCategory(id:string){void run(`rename-${id}`,async()=>{const json=await request("/api/knowledge/categories",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({workspaceId:workspace.id,id,name:editingName})});onChange(categories.map(item=>item.id===id?json.category:item));setEditingId("");setNotice({tone:"success",text:"Category renamed"});});}

 function move(index:number,direction:-1|1){
  const target=index+direction;if(target<0||target>=categories.length||busy)return;
  const previous=categories;const reordered=[...categories];[reordered[index],reordered[target]]=[reordered[target],reordered[index]];const normalized=reordered.map((item,position)=>({...item,position}));onChange(normalized);
  void run(`move-${index}`,async()=>{const responses=await Promise.all(normalized.map(item=>fetch("/api/knowledge/categories",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({workspaceId:workspace.id,id:item.id,position:item.position})})));if(responses.some(response=>!response.ok)){onChange(previous);throw new Error("Could not reorder categories");}setNotice({tone:"success",text:"Category order saved"});});
 }

 function removeCategory(id:string){if(!window.confirm("Delete this category? Its articles will become uncategorised."))return;void run(`delete-${id}`,async()=>{await request("/api/knowledge/categories",{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({workspaceId:workspace.id,id})});onChange(categories.filter(item=>item.id!==id));onDelete(id);setNotice({tone:"success",text:"Category deleted"});});}

 return <section className="section-card category-manager"><div className="category-manager-heading"><div><h2>Categories</h2><p className="muted">Organise public help-centre articles.</p></div><div className="category-create"><input disabled={busy} value={name} onChange={event=>setName(event.target.value)} placeholder="New category" maxLength={80}/><button className="primary-button" aria-busy={action==="create"} onClick={createCategory} disabled={busy||name.trim().length<2}><Plus size={15}/>{action==="create"?"Adding…":"Add"}</button></div></div>{notice&&<p className={notice.tone==="error"?"form-error":notice.tone==="success"?"form-success":"muted"} role="status" aria-live="polite">{notice.text}</p>}<div className="category-list">{categories.map((category,index)=><div className="category-row" key={category.id}>{editingId===category.id?<input disabled={busy} value={editingName} onChange={event=>setEditingName(event.target.value)} autoFocus/>:<div><strong>{category.name}</strong><small className="muted">/{category.slug}</small></div>}<div className="category-actions">{editingId===category.id?<button className="chip" aria-busy={action===`rename-${category.id}`} onClick={()=>renameCategory(category.id)} disabled={busy}><Save size={14}/>{action===`rename-${category.id}`?"Saving…":"Save"}</button>:<button className="chip" disabled={busy} onClick={()=>{setEditingId(category.id);setEditingName(category.name)}}>Rename</button>}<button className="chip" aria-label="Move category up" onClick={()=>move(index,-1)} disabled={busy||index===0}><ArrowUp size={14}/></button><button className="chip" aria-label="Move category down" onClick={()=>move(index,1)} disabled={busy||index===categories.length-1}><ArrowDown size={14}/></button><button className="chip danger-chip" aria-busy={action===`delete-${category.id}`} onClick={()=>removeCategory(category.id)} disabled={busy}><Trash2 size={14}/>{action===`delete-${category.id}`?"Deleting…":""}</button></div></div>)}{!categories.length&&<p className="muted">No categories yet. Articles can still remain uncategorised.</p>}</div></section>;
}
