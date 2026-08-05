import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const workspaceId = url.searchParams.get("workspace");
  const workspaceKey = url.searchParams.get("workspaceKey");
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 120);

  if (!workspaceId && !workspaceKey) {
    return NextResponse.json({ error: "Missing workspace" }, { status: 400 });
  }

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  let resolvedWorkspaceId = workspaceId;
  let workspaceSlug: string | null = null;

  if (workspaceKey) {
    const { data: workspace } = await db
      .from("workspaces")
      .select("id,slug")
      .eq("public_key", workspaceKey)
      .maybeSingle();

    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    resolvedWorkspaceId = workspace.id;
    workspaceSlug = workspace.slug;
  }

  const safe = q.replace(/[,%()]/g, " ").trim();
  let query = db
    .from("kb_articles")
    .select("id,title,slug,excerpt,body_html,published_at,kb_categories(name)")
    .eq("workspace_id", resolvedWorkspaceId!)
    .not("published_at", "is", null)
    .order("updated_at", { ascending: false })
    .limit(5);

  if (safe) {
    query = query.or(`title.ilike.%${safe}%,excerpt.ilike.%${safe}%,body_html.ilike.%${safe}%`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "Search unavailable" }, { status: 500 });

  return NextResponse.json({
    articles: (data ?? []).map((article) => ({
      ...article,
      url: workspaceSlug ? `/help/${workspaceSlug}/${article.slug}` : null,
    })),
  });
}
