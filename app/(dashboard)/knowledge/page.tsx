import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAgentContext } from "@/lib/data/inbox";
import { KnowledgeWorkspace } from "@/components/knowledge/knowledge-workspace";
export default async function KnowledgePage(){const context=await getAgentContext();if(!context)return redirect("/onboarding");const db=await createClient();const [{data:articles},{data:categories}]=await Promise.all([db.from("kb_articles").select("id,workspace_id,category_id,title,slug,body_html,excerpt,published_at,updated_at,kb_categories(name)").eq("workspace_id",context.workspace.id).order("updated_at",{ascending:false}),db.from("kb_categories").select("id,name,slug,position").eq("workspace_id",context.workspace.id).order("position")]);return <KnowledgeWorkspace workspace={context.workspace} initialArticles={articles??[]} initialCategories={categories??[]}/>}
