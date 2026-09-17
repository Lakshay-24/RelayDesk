import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PairClient from "./PairClient";

export const dynamic = "force-dynamic";

export default async function PairPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const params = await searchParams;
  const code = String(params.code ?? "").trim().toUpperCase();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const next = `/pair${code ? `?code=${encodeURIComponent(code)}` : ""}`;
  if (!user) redirect(`/auth/login?next=${encodeURIComponent(next)}`);
  return <PairClient initialCode={code} email={user.email ?? ""} />;
}
