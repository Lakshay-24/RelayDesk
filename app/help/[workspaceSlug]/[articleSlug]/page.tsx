import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizeArticleHtml } from "@/lib/sanitize-html";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ workspaceSlug: string; articleSlug: string }> };
type PublicArticle = {
  id: string;
  title: string;
  excerpt: string | null;
  body_html: string | null;
  kb_categories: unknown;
};

function categoryName(value: unknown) {
  if (Array.isArray(value)) return (value[0] as { name?: string } | undefined)?.name ?? "Guide";
  return (value as { name?: string } | null)?.name ?? "Guide";
}

export default async function HelpArticlePage({ params }: Props) {
  const { workspaceSlug, articleSlug } = await params;
  const db = createAdminClient();

  const { data: workspace } = await db
    .from("workspaces")
    .select("id,name,slug")
    .eq("slug", workspaceSlug)
    .maybeSingle();

  if (!workspace) notFound();

  const { data } = await db
    .from("kb_articles")
    .select("id,title,excerpt,body_html,published_at,kb_categories(name)")
    .eq("workspace_id", workspace.id)
    .eq("slug", articleSlug)
    .not("published_at", "is", null)
    .maybeSingle();

  if (!data) notFound();
  const article = data as unknown as PublicArticle;

  return (
    <main className="help-article-page">
      <nav>
        <Link href={`/help/${workspace.slug}`}>← {workspace.name} help center</Link>
      </nav>
      <article>
        <p className="eyebrow">{categoryName(article.kb_categories)}</p>
        <h1>{article.title}</h1>
        {article.excerpt && <p className="help-article-excerpt">{article.excerpt}</p>}
        <div
          className="help-article-body"
          dangerouslySetInnerHTML={{ __html: sanitizeArticleHtml(article.body_html ?? "") }}
        />
      </article>
    </main>
  );
}
