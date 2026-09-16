"use strict";

const fs=require("fs"),path=require("path"),crypto=require("crypto"),http=require("http");
const OWNER=process.env.ADMIN_USERNAME||"admin";
const SECRET=process.env.SESSION_SECRET||"replace-this-secret";
const DATA_DIR=process.env.CONTENT_DATA_DIR||(process.env.HOME?path.join(process.env.HOME,"site","data"):path.join(__dirname,"data"));
const FILE=path.join(DATA_DIR,"keep-in-touch.json");
const PAGE=path.join(__dirname,"public","keep-in-touch.html");

function ensure(){fs.mkdirSync(DATA_DIR,{recursive:true});}
function read(){ensure();try{const d=JSON.parse(fs.readFileSync(FILE,"utf8"));return {version:1,entries:Array.isArray(d.entries)?d.entries:[]};}catch{return {version:1,entries:[]};}}
function write(data){ensure();const t=FILE+".tmp";fs.writeFileSync(t,JSON.stringify(data,null,2),{encoding:"utf8",mode:0o600});fs.renameSync(t,FILE);try{fs.chmodSync(FILE,0o600);}catch{}}
function json(res,status,value){res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});res.end(JSON.stringify(value));}
function safeEqual(a,b){const aa=Buffer.from(String(a)),bb=Buffer.from(String(b));return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb);}
function sign(raw){return crypto.createHmac("sha256",SECRET).update(raw).digest("hex");}
function token(req){const c=(req.headers.cookie||"").split(";").map(x=>x.trim()).find(x=>x.startsWith("vl_admin="));return c?decodeURIComponent(c.slice(9)):"";}
function isOwner(req){const t=token(req);if(!t.includes("."))return false;const[e,s]=t.split(".");let raw="";try{raw=Buffer.from(e,"base64url").toString();}catch{return false;}if(!safeEqual(s,sign(raw)))return false;const[u,expires,effective]=raw.split("|");return u===OWNER&&Number(expires)>Date.now()&&(!effective||effective===OWNER);}
function sameOrigin(req){const o=req.headers.origin;if(!o)return true;try{return new URL(o).host===req.headers.host;}catch{return false;}}
function body(req,max=200000){return new Promise((ok,no)=>{let b="";req.on("data",c=>{b+=c;if(b.length>max)no(new Error("Request too large"));});req.on("end",()=>{try{ok(b?JSON.parse(b):{})}catch{no(new Error("Invalid request"))}});req.on("error",no)});}
function clean(v,max){return String(v||"").trim().replace(/\s+/g," ").slice(0,max);}
function emailOk(v){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);}
function mobileOk(v){return /^(?:\+44|0)7\d{9}$/.test(v.replace(/[\s()-]/g,""));}
function csv(data){const q=v=>`"${String(v??"").replace(/"/g,'""')}"`;return ['Name,Email,Mobile,Consent date,Source',...data.entries.map(e=>[e.name,e.email,e.mobile,e.consentAt,e.source||'keep-in-touch'].map(q).join(','))].join('\n');}
function injectAdmin(html){return html.replace('</aside>','<button data-panel="keep-in-touch">Keep in Touch</button></aside>').replace('</main>','<section id="panel-keep-in-touch" class="admin-panel" hidden><div class="admin-heading"><div><span class="eyebrow">Marketing</span><h1>Keep in Touch</h1></div><div class="actions"><button id="refreshKeepInTouch" class="btn dark" type="button">Refresh</button><a class="btn" href="/api/admin/keep-in-touch/export">Export CSV</a></div></div><p id="keepInTouchMeta" class="save-status"></p><div id="keepInTouchRows"></div></section></main>').replace('</body>','<script src="/assets/js/keep-in-touch-admin.js?v=1.0.0"></script></body>');}

async function handle(req,res,pathname){
  if(pathname==="/keep-in-touch"&&req.method==="GET"){res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"});res.end(fs.readFileSync(PAGE,"utf8"));return true;}
  if(pathname==="/api/keep-in-touch/signup"&&req.method==="POST"){
    if(!sameOrigin(req)){json(res,403,{error:"Invalid request origin."});return true;}
    const b=await body(req);const name=clean(b.name,100),email=clean(b.email,160).toLowerCase(),mobile=clean(b.mobile,30);
    if(name.length<2){json(res,400,{error:"Please enter your name."});return true;}if(!emailOk(email)){json(res,400,{error:"Please enter a valid email address."});return true;}if(!mobileOk(mobile)){json(res,400,{error:"Please enter a valid UK mobile number."});return true;}if(b.marketingConsent!==true){json(res,400,{error:"Please confirm that you are happy to receive Village Limits marketing."});return true;}if(String(b.website||"").trim()){json(res,200,{ok:true});return true;}
    const data=read(),now=new Date().toISOString(),normalMobile=mobile.replace(/[\s()-]/g,"");const found=data.entries.find(e=>e.email===email||String(e.mobile||"").replace(/[\s()-]/g,"")===normalMobile);
    if(found)Object.assign(found,{name,email,mobile,consent:true,consentAt:now,consentVersion:"2026-09-v1",source:"keep-in-touch",updatedAt:now});else data.entries.push({id:crypto.randomUUID(),name,email,mobile,consent:true,consentAt:now,consentVersion:"2026-09-v1",source:"keep-in-touch",createdAt:now,updatedAt:now});write(data);json(res,200,{ok:true});return true;
  }
  if(pathname==="/api/admin/keep-in-touch"&&req.method==="GET"){if(!isOwner(req)){json(res,403,{error:"Owner access required."});return true;}const data=read();json(res,200,{count:data.entries.length,entries:[...data.entries].sort((a,b)=>String(b.consentAt).localeCompare(String(a.consentAt)))});return true;}
  if(pathname==="/api/admin/keep-in-touch/export"&&req.method==="GET"){if(!isOwner(req)){res.writeHead(302,{Location:"/admin"});res.end();return true;}res.writeHead(200,{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":"attachment; filename=Village-Limits-Keep-In-Touch.csv","Cache-Control":"no-store"});res.end(csv(read()));return true;}
  return false;
}

const original=http.createServer;
http.createServer=function keepInTouchServer(options,requestListener){const listener=typeof options==="function"?options:requestListener;const serverOptions=typeof options==="function"?undefined:options;const wrapped=async(req,res)=>{try{const u=new URL(req.url,`http://${req.headers.host||"localhost"}`);if(await handle(req,res,decodeURIComponent(u.pathname)))return;
    if((u.pathname==="/admin"||u.pathname==="/admin/")&&req.method==="GET"&&isOwner(req)){
      const ow=res.writeHead.bind(res),oe=res.end.bind(res);let htmlMode=false;
      res.writeHead=(status,headers)=>{const ct=String(headers?.["Content-Type"]||headers?.["content-type"]||"");htmlMode=status===200&&ct.includes("text/html");return htmlMode?res:ow(status,headers);};
      res.end=(chunk,enc,cb)=>{if(htmlMode){const out=injectAdmin(Buffer.isBuffer(chunk)?chunk.toString("utf8"):String(chunk||""));ow(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"});return oe(out,enc,cb);}return oe(chunk,enc,cb);};
    }
    return listener(req,res);
  }catch(err){console.error("Keep in Touch error",err);if(!res.headersSent)json(res,500,{error:"Request failed."});else res.end();}};return serverOptions===undefined?original.call(http,wrapped):original.call(http,serverOptions,wrapped);};

require("./stocktake-entry");
