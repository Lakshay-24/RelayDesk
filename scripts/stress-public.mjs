const { performance } = await import("node:perf_hooks");

const base=process.env.RELAYDESK_STRESS_BASE||"https://relay-desk-mjq6.vercel.app";
const users=Number(process.env.RELAYDESK_STRESS_USERS||100);
const perUser=Number(process.env.RELAYDESK_STRESS_REQUESTS_PER_USER||50);
const timeoutMs=Number(process.env.RELAYDESK_STRESS_TIMEOUT_MS||10000);
const routes=["/","/pricing","/support","/health.txt","/.well-known/oauth-protected-resource"];
const results=[];

async function requestWithTimeout(url){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{return await fetch(url,{signal:controller.signal,redirect:"follow"});}
  finally{clearTimeout(timer);}
}

async function hit(user,index){
  const route=routes[(user*37+index*13)%routes.length];
  const start=performance.now();
  let ok=false,status=0,error="";
  try{
    const response=await requestWithTimeout(`${base}${route}?stress_u=${user}&n=${index}&r=${(user*7919+index*104729)%999983}`);
    status=response.status;
    ok=response.ok;
    await response.arrayBuffer();
  }catch(e){error=String(e);}
  results.push({route,ms:performance.now()-start,ok,status,error});
}

async function runUser(user){for(let i=0;i<perUser;i++) await hit(user,i);}

const started=performance.now();
await Promise.all(Array.from({length:users},(_,user)=>runUser(user)));
const elapsed=(performance.now()-started)/1000;
const latencies=results.map(x=>x.ms).sort((a,b)=>a-b);
const quantile=p=>latencies[Math.min(latencies.length-1,Math.floor((latencies.length-1)*p))]??0;
const routeStats={};
for(const route of routes){
  const rows=results.filter(x=>x.route===route);
  const values=rows.map(x=>x.ms).sort((a,b)=>a-b);
  routeStats[route]={
    requests:rows.length,
    ok:rows.filter(x=>x.ok).length,
    failed:rows.filter(x=>!x.ok).length,
    p95_ms:Number((values[Math.floor((values.length-1)*.95)]??0).toFixed(1))
  };
}
const summary={
  virtual_users:users,
  total_requests:results.length,
  ok:results.filter(x=>x.ok).length,
  failed:results.filter(x=>!x.ok).length,
  elapsed_s:Number(elapsed.toFixed(2)),
  rps:Number((results.length/elapsed).toFixed(1)),
  p50_ms:Number(quantile(.5).toFixed(1)),
  p95_ms:Number(quantile(.95).toFixed(1)),
  p99_ms:Number(quantile(.99).toFixed(1)),
  max_ms:Number((latencies.at(-1)??0).toFixed(1)),
  routes:routeStats,
  sample_errors:results.filter(x=>x.error).slice(0,10)
};
console.log(JSON.stringify(summary,null,2));
if(summary.failed>0) process.exitCode=1;
