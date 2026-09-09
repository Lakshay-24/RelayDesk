const SOURCE = "https://atuvyeoctkevglimkmka.supabase.co/functions/v1/legal?doc=terms";

export async function GET() {
  const upstream = await fetch(SOURCE, { cache: "no-store" });
  return new Response(await upstream.arrayBuffer(), {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") ?? "text/html; charset=utf-8" },
  });
}
