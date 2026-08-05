"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Save, Trash2 } from "lucide-react";
import type { Workspace } from "@/types/domain";

export type KnowledgeCategory = { id: string; name: string; slug: string; position: number };

export function CategoryManager({ workspace, categories, onChange, onDelete }: { workspace: Workspace; categories: KnowledgeCategory[]; onChange: (categories: KnowledgeCategory[]) => void; onDelete: (id: string) => void }) {
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState("");
  const [editingName, setEditingName] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function createCategory() {
    if (name.trim().length < 2 || busy) return;
    setBusy(true); setNotice("");
    const response = await fetch("/api/knowledge/categories", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspaceId: workspace.id, name }) });
    const json = await response.json();
    if (response.ok) { onChange([...categories, json.category].sort((a, b) => a.position - b.position)); setName(""); setNotice("Category created"); }
    else setNotice(json.error ?? "Could not create category");
    setBusy(false);
  }

  async function renameCategory(id: string) {
    if (editingName.trim().length < 2 || busy) return;
    setBusy(true); setNotice("");
    const response = await fetch("/api/knowledge/categories", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspaceId: workspace.id, id, name: editingName }) });
    const json = await response.json();
    if (response.ok) { onChange(categories.map((item) => item.id === id ? json.category : item)); setEditingId(""); setNotice("Category renamed"); }
    else setNotice(json.error ?? "Could not rename category");
    setBusy(false);
  }

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= categories.length || busy) return;
    const reordered = [...categories];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    const normalized = reordered.map((item, position) => ({ ...item, position }));
    onChange(normalized); setBusy(true); setNotice("");
    const responses = await Promise.all(normalized.map((item) => fetch("/api/knowledge/categories", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspaceId: workspace.id, id: item.id, position: item.position }) })));
    if (responses.some((response) => !response.ok)) { onChange(categories); setNotice("Could not reorder categories"); }
    else setNotice("Category order saved");
    setBusy(false);
  }

  async function removeCategory(id: string) {
    if (busy || !window.confirm("Delete this category? Its articles will become uncategorised.")) return;
    setBusy(true); setNotice("");
    const response = await fetch("/api/knowledge/categories", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspaceId: workspace.id, id }) });
    const json = await response.json();
    if (response.ok) { onChange(categories.filter((item) => item.id !== id)); onDelete(id); setNotice("Category deleted"); }
    else setNotice(json.error ?? "Could not delete category");
    setBusy(false);
  }

  return <section className="section-card category-manager"><div className="category-manager-heading"><div><h2>Categories</h2><p className="muted">Organise public help-centre articles.</p></div><div className="category-create"><input value={name} onChange={(event) => setName(event.target.value)} placeholder="New category" maxLength={80}/><button className="primary-button" onClick={() => void createCategory()} disabled={busy || name.trim().length < 2}><Plus size={15}/>Add</button></div></div>{notice && <p className={notice.startsWith("Could not") ? "form-error" : "muted"}>{notice}</p>}<div className="category-list">{categories.map((category, index) => <div className="category-row" key={category.id}>{editingId === category.id ? <input value={editingName} onChange={(event) => setEditingName(event.target.value)} autoFocus/> : <div><strong>{category.name}</strong><small className="muted">/{category.slug}</small></div>}<div className="category-actions">{editingId === category.id ? <button className="chip" onClick={() => void renameCategory(category.id)} disabled={busy}><Save size={14}/>Save</button> : <button className="chip" onClick={() => { setEditingId(category.id); setEditingName(category.name); }}>Rename</button>}<button className="chip" aria-label="Move category up" onClick={() => void move(index, -1)} disabled={busy || index === 0}><ArrowUp size={14}/></button><button className="chip" aria-label="Move category down" onClick={() => void move(index, 1)} disabled={busy || index === categories.length - 1}><ArrowDown size={14}/></button><button className="chip danger-chip" onClick={() => void removeCategory(category.id)} disabled={busy}><Trash2 size={14}/></button></div></div>)}{!categories.length && <p className="muted">No categories yet. Articles can still remain uncategorised.</p>}</div></section>;
}
