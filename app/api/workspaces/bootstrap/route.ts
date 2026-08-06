import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z.string().trim().regex(/^[a-z0-9-]{2,50}$/),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a workspace name and a URL using 2–50 lowercase letters, numbers, or hyphens." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Your session expired. Sign in again." }, { status: 401 });

  const { data, error } = await supabase.rpc("create_workspace_with_admin", {
    workspace_name: parsed.data.name,
    workspace_slug: parsed.data.slug,
  });

  if (error) {
    const duplicate = error.code === "23505" || /duplicate|unique/i.test(error.message);
    return NextResponse.json(
      { error: duplicate ? "That workspace URL is already taken. Choose another one." : "Could not create the workspace. Please try again." },
      { status: duplicate ? 409 : 500 },
    );
  }

  const workspace = Array.isArray(data) ? data[0] : data;
  const workspaceId = workspace && typeof workspace === "object" && "id" in workspace ? String(workspace.id) : null;
  if (!workspaceId) {
    return NextResponse.json({ error: "Workspace was created but could not be selected. Please open it from Workspaces." }, { status: 500 });
  }

  const response = NextResponse.json({ workspace, existing: false });
  response.cookies.set("relaydesk_workspace", workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}
