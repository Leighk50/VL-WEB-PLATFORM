"use strict";

const fs=require("fs"),path=require("path"),crypto=require("crypto"),http=require("http");
const OWNER=process.env.ADMIN_USERNAME||"admin";
const SECRET=process.env.SESSION_SECRET||"replace-this-secret";
const DATA_DIR=process.env.CONTENT_DATA_DIR||(process.env.HOME?path.join(process.env.HOME,"site","data"):path.join(__dirname,"data"));
const FILE=path.join(DATA_DIR,"keep-in-touch.json");
const WEBEX_TOKEN=process.env.WEBEX_INTERACT_TOKEN||process.env.WEBEX_API_TOKEN||process.env.WEBEX_TOKEN||process.env["Webex API"]||"";
const MS_TENANT_ID=process.env.MS_TENANT_ID||"",MS_CLIENT_ID=process.env.MS_CLIENT_ID||"",MS_CLIENT_SECRET=process.env.MS_CLIENT_SECRET||"";
const MARKETING_SENDER=process.env.MARKETING_SENDER||process.env.EVENT_SENDER||"events@villagelimits.co.uk";
const ALLOWED_INTERESTS=new Set(["restaurant","entertainment","accommodation"]);
function ensure(){fs.mkdirSync(DATA_DIR,{recursive:true});}
function read(){ensure();try{const d=JSON.parse(fs.readFileSync(FILE,"utf8"));return {version:3,entries:Array.isArray(d.entries)?d.entries:[],campaigns:Array.isArray(d.campaigns)?d.campaigns:[]};}catch{return {version:3,entries:[],campaigns:[]};}}
function write(data){ensure();const t=FILE+".tmp";fs.writeFileSync(t,JSON.stringify(data,null,2),{encoding:"utf8",mode:0o600});fs.renameSync(t,FILE);try{fs.chmodSync(FILE,0o600);}catch{}}
function json(res,status,value){res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});res.end(JSON.stringify(value));}
function body(req,max=300000){return new Promise((ok,no)=>{let b="";req.on("data",c=>{b+=c;if(b.length>max)no(new Error("Request too large"));});req.on("end",()=>{try{ok(b?JSON.parse(b):{})}catch{no(new Error("Invalid request"))}});req.on("error",no)});}
function clean(v,max){return String(v||"").trim().replace(/\s+/g," ").slice(0,max);}
function safeEqual(a,b){const aa=Buffer.from(String(a)),bb=Buffer.from(String(b));return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb);}
function sign(raw){return crypto.createHmac("sha256",SECRET).update(raw).digest("hex");}
function token(req){const c=(req.headers.cookie||"").split(";").map(x=>x.trim()).find(x=>x.startsWith("vl_admin="));return c?decodeURIComponent(c.slice(9)):"";}
function isOwner(req){const t=token(req);if(!t.includes("."))return false;const[e,s]=t.split(".");let raw="";try{raw=Buffer.from(e,"base64url").toString();}catch{return false;}if(!safeEqual(s,sign(raw)))return false;const[u,expires,effective]=raw.split("|");return u===OWNER&&Number(expires)>Date.now()&&(!effective||effective===OWNER);}
function sameOrigin(req){const o=req.headers.origin;if(!o)return true;try{return new URL(o).host===req.headers.host;}catch{return false;}}
function emailOk(v){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);}
function mobileOk(v){return /^(?:\+44|0)7\d{9}$/.test(v.replace(/[\s()-]/g,""));}
function postcodeOk(v){return /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i.test(v);}
function normalizePostcode(v){const s=clean(v,12).toUpperCase().replace(/\s+/g,"");return s.length>3?`${s.slice(0,-3)} ${s.slice(-3)}`:s;}
function localBand(postcode){const outward=String(postcode||"").toUpperCase().split(/\s+/)[0];if(/^LN(?:4|10)(?:\D|$)/.test(outward))return "local";if(/^LN/.test(outward))return "lincolnshire";return "visitor";}
function cleanInterests(v){return [...new Set((Array.isArray(v)?v:[]).map(x=>String(x).toLowerCase()).filter(x=>ALLOWED_INTERESTS.has(x)))];}
function csv(data){const q=v=>`"${String(v??"").replace(/"/g,'""')}"`;return ['Name,Email,Mobile,Postcode,Audience,Interests,Consent date,Status,Source',...data.entries.map(e=>[e.name,e.email,e.mobile,e.postcode||'',e.audience||'',(e.interests||[]).join('; '),e.consentAt,e.unsubscribedAt?'Unsubscribed':'Active',e.source||'keep-in-touch'].map(q).join(','))].join('\n');}

async function handle(req,res,pathname){
  if(pathname==="/api/keep-in-touch/signup"&&req.method==="POST"){
    if(!sameOrigin(req)){json(res,403,{error:"Invalid request origin."});return true;}
    const b=await body(req),name=clean(b.name,100),email=clean(b.email,160).toLowerCase(),mobile=clean(b.mobile,30),postcode=normalizePostcode(b.postcode),interests=cleanInterests(b.interests);
    if(name.length<2){json(res,400,{error:"Please enter your name."});return true;}if(!emailOk(email)){json(res,400,{error:"Please enter a valid email address."});return true;}if(!mobileOk(mobile)){json(res,400,{error:"Please enter a valid UK mobile number."});return true;}if(!postcodeOk(postcode)){json(res,400,{error:"Please enter a valid UK postcode."});return true;}if(!interests.length){json(res,400,{error:"Please choose at least one interest."});return true;}if(b.marketingConsent!==true){json(res,400,{error:"Please confirm that you are happy to receive Village Limits marketing."});return true;}if(String(b.website||"").trim()){json(res,200,{ok:true});return true;}
    const data=read(),now=new Date().toISOString(),normalMobile=mobile.replace(/[\s()-]/g,"");const found=data.entries.find(e=>e.email===email||String(e.mobile||"").replace(/[\s()-]/g,"")===normalMobile);const fields={name,email,mobile,postcode,audience:localBand(postcode),interests,consent:true,consentAt:now,consentVersion:"2026-09-v2",source:"keep-in-touch",unsubscribedAt:null,updatedAt:now};
    if(found)Object.assign(found,fields);else data.entries.push({id:crypto.randomUUID(),...fields,createdAt:now});write(data);json(res,200,{ok:true});return true;
  }
  if(pathname==="/api/admin/keep-in-touch"&&req.method==="GET"){
    if(!isOwner(req))return false;const data=read();const entries=[...data.entries].sort((a,b)=>String(b.consentAt).localeCompare(String(a.consentAt)));json(res,200,{count:entries.length,activeCount:entries.filter(e=>e.consent===true&&!e.unsubscribedAt).length,entries,campaigns:data.campaigns.slice(-10).reverse(),preferenceFields:true,smsConfigured:Boolean(WEBEX_TOKEN),emailConfigured:Boolean(MS_TENANT_ID&&MS_CLIENT_ID&&MS_CLIENT_SECRET&&MARKETING_SENDER),marketingSender:MARKETING_SENDER});return true;
  }
  if(pathname==="/api/admin/keep-in-touch/export"&&req.method==="GET"){
    if(!isOwner(req))return false;res.writeHead(200,{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":"attachment; filename=Village-Limits-Keep-In-Touch.csv","Cache-Control":"no-store"});res.end(csv(read()));return true;
  }
  return false;
}

const original=http.createServer;
http.createServer=function preferencesServer(options,requestListener){const listener=typeof options==="function"?options:requestListener;const serverOptions=typeof options==="function"?undefined:options;const wrapped=async(req,res)=>{try{const u=new URL(req.url,`http://${req.headers.host||"localhost"}`);if(await handle(req,res,decodeURIComponent(u.pathname)))return;return listener(req,res);}catch(err){console.error("Keep in Touch preferences error",err);if(!res.headersSent)json(res,500,{error:"Request failed."});else res.end();}};return serverOptions===undefined?original.call(http,wrapped):original.call(http,serverOptions,wrapped);};

require("./keep-in-touch-entry");
