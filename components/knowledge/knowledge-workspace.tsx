"use client";

import { useMemo,useRef,useState } from "react";
import { Bold,BookOpenText,Eye,Heading2,Italic,Link2,List,Plus,Save,Search,Trash2 } from "lucide-react";
import type { Workspace } from "@/types/domain";
import { CategoryManager,type KnowledgeCategory } from "@/components/knowledge/category-manager";

type Article={id:string;workspace_id:string;category_id:string|null;title:string;slug:string;body_html:string;excerpt:string|null;published_at:string|null;updated_at:string;kb_categories?:{name:string}|{name:string}[]|null};
type Notice={tone:"success"|"error"|"info";text:string}|null;

export function KnowledgeWorkspace({workspace,initialArticles,initialCategories}:{workspace:Workspace;initialArticles:Article[];initialCategories:KnowledgeCategory[]}){
 const [articles,setArticles]=useState(initialArticles);
 const [categories,setCategories]=useState([...initialCategories].sort((a,b)=>a.position-b.position));
 const [selectedId,setSelectedId]=useState(initialArticles[0]?.id??"");
 const [query,setQuery]=useState("");
 const [notice,setNotice]=useState<Notice>(null);
 const [preview,setPreview]=useState(false);
 const [action,setAction]=useState<"save"|"publish"|"unpublish"|"delete"|"">("");
 const bodyRef=useRef<HTMLTextAreaElement|null>(null);
 const selected=articles.find(article=>article.id===selectedId);
 const filtered=useMemo(()=>articles.filter(article=>`${article.title} ${article.excerpt??""}`.toLowerCase().includes(query.toLowerCase())),[articles,query]);
 const patch=(changes:Partial<Article>)=>selected&&setArticles(current=>current.map(article=>article.id===selected.id?{...article,...changes}:article));
 const busy=Boolean(action);

 function createDraft(){
  const id=`draft-${crypto.randomUUID()}`;
  setArticles(current=>[{id,workspace_id:workspace.id,category_id:categories[0]?.id??null,title:"Untitled article",slug:`article-${Date.now()}`,body_html:"",excerpt:null,published_at:null,updated_at:new Date().toISOString()},...current]);
  setSelectedId(id);setPreview(false);setNotice(null);
 }

 function wrap(before:string,after=before,placeholder="text"){
  if(!selected)return;
  const area=bodyRef.current;const start=area?.selectionStart??selected.body_html.length;const end=area?.selectionEnd??start;const chosen=selected.body_html.slice(start,end)||placeholder;
  patch({body_html:`${selected.body_html.slice(0,start)}${before}${chosen}${after}${selected.body_html.slice(end)}`});
  requestAnimationFrame(()=>{area?.focus();area?.setSelectionRange(start+before.length,start+before.length+chosen.length)});
 }

 function addLink(){const url=window.prompt("Link URL","https://");if(url?.startsWith("http"))wrap(`<a href="${url}" target="_blank" rel="noreferrer">`,`</a>`,"link text")}

 async function save(published:boolean){
  if(!selected||busy)return;
  if(selected.title.trim().length<2||selected.slug.trim().length<2||!selected.body_html.trim()){setNotice({tone:"error",text:"Title, slug and article body are required"});return;}
  const nextAction=published?"publish":selected.published_at?"unpublish":"save";
  setAction(nextAction);setNotice({tone:"info",text:published?"Publishing article…":selected.published_at?"Unpublishing article…":"Saving draft…"});
  const isDraft=selected.id.startsWith("draft-");
  try{
   const response=await fetch("/api/knowledge/articles",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id:isDraft?undefined:selected.id,workspaceId:workspace.id,categoryId:selected.category_id,title:selected.title,slug:selected.slug,excerpt:selected.excerpt,bodyHtml:selected.body_html,published})});
   const json=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(json.error??"Could not save article");
   setArticles(current=>current.map(article=>article.id===selected.id?json.article:article));setSelectedId(json.article.id);
   setNotice({tone:"success",text:published?"Article published":selected.published_at?"Article unpublished":"Draft saved"});
  }catch(error){setNotice({tone:"error",text:error instanceof Error?error.message:"Could not save article"});}
  finally{setAction("");}
 }

 async function remove(){
  if(!selected||busy||!window.confirm("Delete this article permanently?"))return;
  setAction("delete");setNotice({tone:"info",text:"Deleting article…"});
  try{
   if(!selected.id.startsWith("draft-")){
    const response=await fetch(`/api/knowledge/articles?id=${selected.id}&workspaceId=${workspace.id}`,{method:"DELETE"});
    const json=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(json.error??"Could not delete article");
   }
   setArticles(current=>current.filter(article=>article.id!==selected.id));setSelectedId("");setNotice({tone:"success",text:"Article deleted"});
  }catch(error){setNotice({tone:"error",text:error instanceof Error?error.message:"Could not delete article"});}
  finally{setAction("");}
 }

 return <section className="knowledge-page">
  <div className="page-title-row"><div><p className="eyebrow">{workspace.name}</p><h1>Knowledge base</h1></div><button className="primary-button" onClick={createDraft} disabled={busy}><Plus size={16}/>New article</button></div>
  <CategoryManager workspace={workspace} categories={categories} onChange={setCategories} onDelete={id=>setArticles(current=>current.map(article=>article.category_id===id?{...article,category_id:null}:article))}/>
  {notice&&<div className={`notice-banner ${notice.tone==="error"?"form-error":notice.tone==="success"?"form-success":""}`} role="status" aria-live="polite">{notice.text}</div>}
  <div className="knowledge-grid">
   <aside className="article-list"><div className="pane-header"><label><Search size={15}/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search articles"/></label></div>{filtered.map(article=><button className={`article-item ${selected?.id===article.id?"active":""}`} key={article.id} onClick={()=>{setSelectedId(article.id);setPreview(false)}}><strong>{article.title}</strong><div className="muted">{article.published_at?"Published":"Draft"}</div></button>)}</aside>
   <main className="editor">{selected?<>
    {preview?<article className="article-preview"><p className="eyebrow">Preview</p><h1>{selected.title}</h1>{selected.excerpt&&<p className="muted">{selected.excerpt}</p>}<div className="article-body" dangerouslySetInnerHTML={{__html:selected.body_html}}/></article>:<>
     <label>Title<input disabled={busy} value={selected.title} onChange={event=>patch({title:event.target.value})}/></label>
     <label>Slug<input disabled={busy} value={selected.slug} onChange={event=>patch({slug:event.target.value.toLowerCase().replace(/[^a-z0-9-]+/g,"-")})}/></label>
     <label>Excerpt<textarea disabled={busy} value={selected.excerpt??""} onChange={event=>patch({excerpt:event.target.value||null})} placeholder="Short description used in search results"/></label>
     <label>Category<select disabled={busy} value={selected.category_id??""} onChange={event=>patch({category_id:event.target.value||null})}><option value="">Uncategorised</option>{categories.map(category=><option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
     <div className="filters" aria-label="Rich text controls"><button type="button" className="chip" disabled={busy} onClick={()=>wrap("<strong>","</strong>")}><Bold size={14}/>Bold</button><button type="button" className="chip" disabled={busy} onClick={()=>wrap("<em>","</em>")}><Italic size={14}/>Italic</button><button type="button" className="chip" disabled={busy} onClick={()=>wrap("<h2>","</h2>","Heading")}><Heading2 size={14}/>Heading</button><button type="button" className="chip" disabled={busy} onClick={()=>wrap("<ul><li>","</li></ul>","List item")}><List size={14}/>List</button><button type="button" className="chip" disabled={busy} onClick={addLink}><Link2 size={14}/>Link</button></div>
     <label>Article body<textarea disabled={busy} ref={bodyRef} value={selected.body_html} onChange={event=>patch({body_html:event.target.value})} placeholder="Write a clear customer-facing answer…" rows={16}/></label>
    </>}
    <div className="filters"><button className="primary-button" aria-busy={action==="save"} onClick={()=>void save(false)} disabled={busy}><Save size={15}/>{action==="save"?"Saving draft…":"Save draft"}</button>{selected.published_at?<button className="chip" aria-busy={action==="unpublish"} onClick={()=>void save(false)} disabled={busy}>{action==="unpublish"?"Unpublishing…":"Unpublish"}</button>:<button className="chip" aria-busy={action==="publish"} onClick={()=>void save(true)} disabled={busy}><BookOpenText size={15}/>{action==="publish"?"Publishing…":"Publish"}</button>}<button className="chip" onClick={()=>setPreview(value=>!value)} disabled={busy}><Eye size={15}/>{preview?"Edit":"Preview"}</button><button className="chip danger-chip" aria-busy={action==="delete"} onClick={()=>void remove()} disabled={busy}><Trash2 size={15}/>{action==="delete"?"Deleting…":"Delete"}</button></div>
   </>:<div className="empty-state">Create or select an article.</div>}</main>
  </div>
 </section>;
}
