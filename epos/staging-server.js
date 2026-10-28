"use strict";
const http=require("node:http"),fs=require("node:fs"),path=require("node:path");
const {Pool}=require("pg");
const {authenticated,getTableSnapshot}=require("./shared-read-api");
const {authenticateDevice}=require("./device-auth");
const {startPairing,redeemPairing}=require("./device-pairing");
const sharedTill=require("./shared-till");
const licensing=require("./site-licensing");
const approvals=require("./licence-approval");
const masterTill=require("./master-till");
const printQueue=require("./print-queue");
const billPrint=require("./bill-print");
const printAuth=require("./print-service-auth");
const catalogue=require("./catalogue-data.json");
const databaseUrl=process.env.POSTGRESQLCONNSTR_EPOS_DATABASE_URL||process.env.EPOS_DATABASE_URL;
const pool=databaseUrl?new Pool({connectionString:databaseUrl,connectionTimeoutMillis:5000,max:2}):null;
// Refresh only against an existing paid-through entitlement; never mark invoices paid here.
if(pool){
 const renew=()=>licensing.renewPaidLicences(pool,"VL").catch(err=>console.error("Licence refresh failed",err.code||"database_error"));
 setTimeout(renew,30000).unref();
 setInterval(renew,6*60*60*1000).unref();
}
const root=__dirname,files={"/":"index.html","/kitchen":"kitchen.html","/catalogue":"catalogue.html","/manager":"manager.html","/devices":"devices.html","/shared":"shared.html","/licensing":"licensing.html","/catalogue-data.json":"catalogue-data.json","/manifest.webmanifest":"manifest.webmanifest","/icon.svg":"icon.svg","/service-worker.js":"service-worker.js","/epos-mobile-v1.css":"epos-mobile-v1.css"};
http.createServer(async(req,res)=>{
 const route=(req.url||"/").split("?")[0];
 if(route==="/api/print-service/enrol"){
  const reply=(code,data)=>{res.writeHead(code,{"Content-Type":"application/json","Cache-Control":"no-store"});res.end(JSON.stringify(data))};
  if(req.method!=="POST")return reply(405,{error:"method_not_allowed"});
  if(!authenticated(req,process.env.EPOS_STAGING_API_KEY))return reply(401,{error:"manager_authorisation_required"});
  if(!pool)return reply(503,{error:"database_unavailable"});
  try{return reply(200,await printAuth.issue(pool))}catch(e){return reply(409,{error:"enrolment_failed"})}
 }
 if(route.startsWith("/api/print/")){
  const reply=(code,data)=>{res.writeHead(code,{"Content-Type":"application/json","Cache-Control":"no-store"});res.end(JSON.stringify(data))};
  if(!pool)return reply(503,{error:"database_unavailable"});
  let device;
  try{device=await (route==="/api/print/claim"||route==="/api/print/complete"?printAuth.authenticate(pool,req):authenticateDevice(pool,req))}catch(e){return reply(503,{error:"authentication_unavailable"})}
  if(!device||device.kind!=="till")return reply(401,{error:"registered_till_required"});
  if(route==="/api/print/test"||route==="/api/print/bill"){const licence=await licensing.status(pool,(req.headers.authorization||"").slice(7)).catch(()=>null);if(!licence?.valid)return reply(403,{error:"licence_inactive"})}
  let body={};
  if(req.method==="POST"){
   let raw="";
   try{for await(const part of req){raw+=part;if(raw.length>2048)return reply(413,{error:"payload_too_large"})}body=raw?JSON.parse(raw):{}}
   catch(e){return reply(400,{error:"invalid_payload"})}
  }
  try{
   if(route==="/api/print/test"&&req.method==="POST")return reply(200,await printQueue.enqueueTest(pool,device));
   if(route==="/api/print/bill"&&req.method==="POST")return reply(200,await billPrint.enqueueBill(pool,device,body));
   const master=await pool.query(`SELECT master_device_id FROM epos_site_local_services WHERE venue_id=$1`,[device.venue_id]);
   if(master.rows[0]?.master_device_id!==device.id)return reply(403,{error:"master_till_only"});
   if(route==="/api/print/claim"&&req.method==="POST")return reply(200,{job:await printQueue.claimNext(pool,device)});
   if(route==="/api/print/complete"&&req.method==="POST")return reply(200,await printQueue.complete(pool,device,body));
   return reply(405,{error:"unsupported_action"});
  }catch(e){console.error("Print queue error",e.code||e.message);return reply(409,{error:"print_queue_operation_failed"})}
 }
 if(route==="/api/master-till"){
  const respond=(code,data)=>{res.writeHead(code,{"Content-Type":"application/json","Cache-Control":"no-store"});res.end(JSON.stringify(data))};
  if(!pool)return respond(503,{error:"database_unavailable"});
  if(!authenticated(req,process.env.EPOS_STAGING_API_KEY))return respond(401,{error:"manager_authorisation_required"});
  try{
   if(req.method==="GET")return respond(200,await masterTill.getMaster(pool));
   if(req.method!=="POST")return respond(405,{error:"method_not_allowed"});
   let body="";for await(const chunk of req){body+=chunk;if(body.length>512)return respond(413,{error:"payload_too_large"})}
   const input=JSON.parse(body);
   return respond(200,await masterTill.setMaster(pool,input.deviceCode));
  }catch(e){return respond(409,{error:e.message||"master_configuration_failed"})}
 }
 if(route.startsWith("/api/licensing/")){
  const respond=(code,data)=>{res.writeHead(code,{"Content-Type":"application/json","Cache-Control":"no-store"});res.end(JSON.stringify(data))};
  if(!pool)return respond(503,{error:"database_unavailable"});
  if(route==="/api/licensing/status"){
    const auth=req.headers.authorization||"";
    if(req.method!=="GET")return respond(405,{error:"method_not_allowed"});
    try{const result=await licensing.status(pool,auth.startsWith("Bearer ")?auth.slice(7):"");return respond(result?200:401,result||{error:"unregistered"})}
    catch(e){return respond(503,{error:"status_unavailable"})}
  }
  if(route==="/api/licensing/devices"){
    if(req.method!=="GET")return respond(405,{error:"method_not_allowed"});
    if(!authenticated(req,process.env.EPOS_STAGING_API_KEY))return respond(401,{error:"manager_authorisation_required"});
    try{return respond(200,await licensing.listDevices(pool,"VL"))}
    catch(e){return respond(503,{error:"device_list_unavailable"})}
  }
  if(route==="/api/licensing/renew"){
    if(req.method!=="POST")return respond(405,{error:"method_not_allowed"});
    if(!authenticated(req,process.env.EPOS_STAGING_API_KEY))return respond(401,{error:"manager_authorisation_required"});
    try{return respond(200,await licensing.renewPaidLicences(pool,"VL"))}
    catch(e){return respond(503,{error:"renewal_unavailable"})}
  }
  if(req.method!=="POST" && route!=="/api/licensing/pending")return respond(405,{error:"method_not_allowed"});
  const publicAction=["/api/licensing/request","/api/licensing/claim"].includes(route);
  if(!publicAction&&!authenticated(req,process.env.EPOS_STAGING_API_KEY))return respond(401,{error:"manager_authorisation_required"});
  if(route==="/api/licensing/pending"){
    if(req.method!=="GET")return respond(405,{error:"method_not_allowed"});
    try{return respond(200,{requests:await approvals.list(pool)})}catch(e){return respond(503,{error:"list_unavailable"})}
  }
  try{
    let body="";
    for await(const chunk of req){body+=chunk;if(body.length>2048)return respond(413,{error:"payload_too_large"})}
    const input=JSON.parse(body);
    if(route==="/api/licensing/request")return respond(200,await approvals.request(pool,input));
    if(route==="/api/licensing/claim")return respond(200,await approvals.claim(pool,input));
    if(route==="/api/licensing/approve")return respond(200,await approvals.approve(pool,input.requestId));
    if(route==="/api/licensing/deregister")return respond(200,await licensing.deregister(pool,input));
    return respond(404,{error:"unknown_endpoint"});
  }catch(e){return respond(409,{error:e.message||"licensing_failed"})}

 }
 if(route.startsWith("/api/till/")){
  const json=(status,data)=>{res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"});res.end(JSON.stringify(data))};
  if(!pool)return json(503,{error:"database_unavailable"});
  let device;
  try{device=await authenticateDevice(pool,req)}catch(e){console.error("Till authentication unavailable",e.code||"error");return json(503,{error:"authentication_unavailable"})}
  if(!device||device.kind!=="till")return json(401,{error:"till_registration_required"});
  if(process.env.EPOS_LICENSING_ENFORCED==="true"){
    const header=req.headers.authorization||"";
    const licence=await licensing.status(pool,header.startsWith("Bearer ")?header.slice(7):"").catch(()=>null);
    if(!licence||!licence.valid)return json(403,{error:"licence_expired_or_inactive"});
  }
  const match=/^\/api\/till\/tables\/(\d{1,2})$/.exec(route);
  if(!match)return json(404,{error:"unknown_endpoint"});
  const tableId=Number(match[1]);
  if(!Number.isInteger(tableId)||tableId<1||tableId>11)return json(400,{error:"invalid_table"});
  if(req.method==="GET"){
   try{return json(200,await sharedTill.getSession(pool,tableId))}
   catch(e){console.error("Shared till read",e.code||e.message);return json(503,{error:"table_unavailable"})}
  }
  if(req.method!=="POST")return json(405,{error:"method_not_allowed"});
  let body="";
  try{
   for await(const chunk of req){body+=chunk;if(body.length>12000)return json(413,{error:"payload_too_large"})}
   const data=JSON.parse(body);
   if(data.action==="open")return json(200,await sharedTill.openTable(pool,{tableId}));
   if(data.action==="addTab"){
    const session=await sharedTill.getSession(pool,tableId);
    if(!session.sessionId) return json(409,{error:"table_not_open"});
    return json(200,await sharedTill.addTab(pool,session.sessionId,data.label));
   }
   if(data.action==="order")return json(200,await sharedTill.submitOrder(pool,catalogue,{tableId,tabId:data.tabId,requestId:data.requestId,lines:data.lines},device));
   return json(400,{error:"unknown_action"});
  }catch(e){console.error("Shared till mutation",e.code||e.message);return json(409,{error:"operation_rejected",message:e.message})}
 }
 if(route==="/api/devices/pair"||route==="/api/devices/redeem"){
  res.setHeader("Content-Type","application/json; charset=utf-8");
  res.setHeader("Cache-Control","no-store");
  if(req.method!=="POST"){res.writeHead(405);return res.end(JSON.stringify({error:"method_not_allowed"}))}
  if(!pool){res.writeHead(503);return res.end(JSON.stringify({error:"database_unavailable"}))}
  if(route==="/api/devices/pair"&&!authenticated(req,process.env.EPOS_STAGING_API_KEY)){
   res.writeHead(401);return res.end(JSON.stringify({error:"unauthorised"}));
  }
  let body="";
  try{
   for await(const part of req){body+=part;if(body.length>4096)throw Error("Payload too large")}
   const input=JSON.parse(body);
   const result=route==="/api/devices/pair"?await startPairing(pool,input):await redeemPairing(pool,input.code);
   res.writeHead(200);return res.end(JSON.stringify(result));
  }catch(err){
   console.error("Device pairing rejected",err.code||err.message);
   res.writeHead(400);return res.end(JSON.stringify({error:"pairing_failed"}));
  }
 }
 if(route==="/api/shared/tables"){
   res.setHeader("Content-Type","application/json; charset=utf-8");
   res.setHeader("Cache-Control","no-store");
   if(req.method!=="GET"){res.writeHead(405);return res.end(JSON.stringify({error:"method_not_allowed"}))}
   if(!authenticated(req,process.env.EPOS_STAGING_API_KEY)){
     let device=null;
     try{if(pool)device=await authenticateDevice(pool,req)}catch(err){console.error("Device authentication unavailable",err.code||"database_error")}
     if(!device){res.writeHead(401);return res.end(JSON.stringify({error:"unauthorised"}))}
   }
   if(!pool){res.writeHead(503);return res.end(JSON.stringify({error:"database_unavailable"}))}
   return getTableSnapshot(pool).then(tables=>{
     res.writeHead(200);res.end(JSON.stringify({tables}))
   }).catch(err=>{
     console.error("Shared EPOS snapshot error",err.code||"query_failed");
     res.writeHead(503);res.end(JSON.stringify({error:"snapshot_unavailable"}))
   });
 }
 if(route==="/health/database"){
   res.setHeader("Content-Type","application/json; charset=utf-8");
   res.setHeader("Cache-Control","no-store");
   if(req.method!=="GET"){res.writeHead(405);return res.end(JSON.stringify({ok:false}))}
   if(!pool){res.writeHead(503);return res.end(JSON.stringify({ok:false,status:"not_configured"}))}
   return pool.query("SELECT 1 FROM epos_devices LIMIT 1").then(()=>{
     res.writeHead(200);res.end(JSON.stringify({ok:true,status:"connected"}))
   }).catch(err=>{
     console.error("EPOS database health check failed",err.code||"connection_error");
     res.writeHead(503);res.end(JSON.stringify({ok:false,status:"connection_failed"}))
   });
 }

 if(req.method!=="GET"||!Object.hasOwn(files,route)){res.writeHead(404,{"Content-Type":"text/plain","Cache-Control":"no-store"});return res.end("Not found")}
 const file=path.join(root,files[route]);
 fs.readFile(file,(err,bytes)=>{if(err){res.writeHead(500);return res.end("Unavailable")}res.writeHead(200,{"Content-Type":route.endsWith(".json")||route.endsWith(".webmanifest")?"application/json; charset=utf-8":route.endsWith(".svg")?"image/svg+xml":route.endsWith(".js")?"application/javascript; charset=utf-8":route.endsWith(".css")?"text/css; charset=utf-8":"text/html; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff","X-Robots-Tag":"noindex, nofollow","Content-Security-Policy":"default-src 'none'; style-src 'self' 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"});res.end(bytes)})
}).listen(process.env.PORT||8080,"0.0.0.0");
