import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizeArticleHtml } from "@/lib/sanitize-html";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ workspaceSlug: string; articleSlug: string }> };

export default async function HelpArticlePage({ params }: Props) {
  const { workspaceSlug, articleSlug } = await params;
  const db = createAdminClient();

  const { data: workspace } = await db
    .from("workspaces")
    .select("id,name,slug")
    .eq("slug", workspaceSlug)
    .maybeSingle();

  if (!workspace) notFound();

  const { data: article } = await db
    .from("kb_articles")
    .select("id,title,excerpt,body_html,published_at,kb_categories(name)")
    .eq("workspace_id", workspace.id)
    .eq("slug", articleSlug)
    .not("published_at", "is", null)
    .maybeSingle();

  if (!article) notFound();

  const category = Array.isArray(article.kb_categories)
    ? article.kb_categories[0]?.name
    : (article.kb_categories as { name?: string } | null)?.name;

  return (
    <main className="help-article-page">
      <nav>
        <Link href={`/help/${workspace.slug}`}>← {workspace.name} help center</Link>
      </nav>
      <article>
        <p className="eyebrow">{category ?? "Guide"}</p>
        <h1>{article.title}</h1>
        {article.excerpt && <p className="help-article-excerpt">{article.excerpt}</p>}
        <div
          className="help-article-body"
          dangerouslySetInnerHTML={{ __html: sanitizeArticleHtml(article.body_html) }}
        />
      </article>
    </main>
  );
}
