const SOURCE="https://atuvyeoctkevglimkmka.supabase.co/functions/v1/billing-status";

export async function GET(){
  const upstream=await fetch(SOURCE,{next:{revalidate:60}});
  const body=await upstream.text();
  return new Response(body,{
    status:upstream.status,
    headers:{
      "content-type":"application/json",
      "cache-control":"public, s-maxage=60, stale-while-revalidate=300"
    }
  });
}
