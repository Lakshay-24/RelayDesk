const base=process.env.RELAYDESK_BASE_URL||"https://relay-desk-mjq6.vercel.app";
const checks=["/","/support","/privacy","/terms","/.well-known/oauth-protected-resource"];
for(const path of checks){const r=await fetch(base+path,{redirect:"manual"});if(!r.ok)throw new Error(`${path} -> ${r.status}`);console.log("OK",path,r.status)}
const m=await fetch(base+"/mcp",{method:"POST",headers:{"content-type":"application/json","accept":"application/json, text/event-stream"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"initialize",params:{protocolVersion:"2025-06-18",capabilities:{},clientInfo:{name:"relaydesk-smoke",version:"1"}}})});
if(m.status!==401)throw new Error(`/mcp expected 401, got ${m.status}`);
const challenge=m.headers.get("www-authenticate")||"";
if(!challenge.includes("/.well-known/oauth-protected-resource"))throw new Error("MCP 401 missing protected-resource challenge");
console.log("OK /mcp 401 challenge");
const meta=await (await fetch(base+"/.well-known/oauth-protected-resource")).json();
if(meta.resource!==base+"/mcp")throw new Error("wrong resource metadata");
console.log("OK metadata resource");
const c=await fetch(base+"/.well-known/openai-apps-challenge");
if(![200,404].includes(c.status))throw new Error(`challenge endpoint ${c.status}`);
console.log("OK challenge endpoint",c.status);
