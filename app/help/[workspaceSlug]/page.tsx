import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ workspaceSlug: string }>; searchParams: Promise<{ q?: string }> };

export default async function HelpCenterPage({ params, searchParams }: Props) {
  const { workspaceSlug } = await params;
  const { q = "" } = await searchParams;
  const db = createAdminClient();

  const { data: workspace } = await db
    .from("workspaces")
    .select("id,name,slug")
    .eq("slug", workspaceSlug)
    .maybeSingle();

  if (!workspace) notFound();

  const safeQuery = q.trim().slice(0, 120).replace(/[,%()]/g, " ");
  let articleQuery = db
    .from("kb_articles")
    .select("id,title,slug,excerpt,published_at,kb_categories(name)")
    .eq("workspace_id", workspace.id)
    .not("published_at", "is", null)
    .order("published_at", { ascending: false });

  if (safeQuery) {
    articleQuery = articleQuery.or(`title.ilike.%${safeQuery}%,excerpt.ilike.%${safeQuery}%`);
  }

  const { data: articles } = await articleQuery;

  return (
    <main className="help-center-page">
      <header className="help-center-header">
        <p className="eyebrow">Help center</p>
        <h1>{workspace.name}</h1>
        <p className="muted">Find answers, guides and troubleshooting steps.</p>
        <form className="help-search">
          <input name="q" defaultValue={q} placeholder="Search help articles" />
          <button className="primary-button">Search</button>
        </form>
      </header>

      <section className="help-article-list">
        {(articles ?? []).map((article) => (
          <Link href={`/help/${workspace.slug}/${article.slug}`} key={article.id} className="help-article-card">
            <small>{Array.isArray(article.kb_categories) ? article.kb_categories[0]?.name : article.kb_categories?.name ?? "Guide"}</small>
            <h2>{article.title}</h2>
            <p>{article.excerpt || "Open this article to read the full guide."}</p>
          </Link>
        ))}
        {!articles?.length && <div className="empty-state">No published articles matched your search.</div>}
      </section>
    </main>
  );
}
