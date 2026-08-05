import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const querySchema = z.object({ contactId: z.string().uuid() });

export async function GET(request: Request) {
  const parsed = querySchema.safeParse({
    contactId: new URL(request.url).searchParams.get("contactId"),
  });
  if (!parsed.success) return NextResponse.json({ error: "Invalid contact" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: contact } = await supabase
    .from("contacts")
    .select("id,workspace_id")
    .eq("id", parsed.data.contactId)
    .maybeSingle();
  if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

  const { data: membership } = await supabase
    .from("memberships")
    .select("id")
    .eq("workspace_id", contact.workspace_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: events, error } = await supabase
    .from("contact_events")
    .select("id,event_type,title,metadata,conversation_id,created_at")
    .eq("contact_id", contact.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ events: events ?? [] });
}
