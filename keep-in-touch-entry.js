"use strict";

const fs=require("fs"),path=require("path"),crypto=require("crypto"),http=require("http");
const OWNER=process.env.ADMIN_USERNAME||"admin";
const SECRET=process.env.SESSION_SECRET||"replace-this-secret";
const DATA_DIR=process.env.CONTENT_DATA_DIR||(process.env.HOME?path.join(process.env.HOME,"site","data"):path.join(__dirname,"data"));
const FILE=path.join(DATA_DIR,"keep-in-touch.json");
const PAGE=path.join(__dirname,"public","keep-in-touch.html");
const WEBEX_TOKEN=process.env.WEBEX_INTERACT_TOKEN||process.env.WEBEX_API_TOKEN||process.env.WEBEX_TOKEN||process.env["Webex API"]||"";
const WEBEX_ENDPOINT="https://api.webexinteract.com/v1/sms";
const MS_TENANT_ID=process.env.MS_TENANT_ID||"";
const MS_CLIENT_ID=process.env.MS_CLIENT_ID||"";
const MS_CLIENT_SECRET=process.env.MS_CLIENT_SECRET||"";
const MARKETING_SENDER=process.env.MARKETING_SENDER||process.env.EVENT_SENDER||"events@villagelimits.co.uk";
const SITE=(process.env.PUBLIC_SITE_URL||"https://www.villagelimits.co.uk").replace(/\/+$/,"");
const SMS_SENDERS=new Map([["VLimits","VLimits"],["447860008022","+447860008022"],["+447860008022","+447860008022"]]);

function ensure(){fs.mkdirSync(DATA_DIR,{recursive:true});}
function read(){ensure();try{const d=JSON.parse(fs.readFileSync(FILE,"utf8"));return {version:2,entries:Array.isArray(d.entries)?d.entries:[],campaigns:Array.isArray(d.campaigns)?d.campaigns:[]};}catch{return {version:2,entries:[],campaigns:[]};}}
function write(data){ensure();const t=FILE+".tmp";fs.writeFileSync(t,JSON.stringify(data,null,2),{encoding:"utf8",mode:0o600});fs.renameSync(t,FILE);try{fs.chmodSync(FILE,0o600);}catch{}}
function json(res,status,value){res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});res.end(JSON.stringify(value));}
function safeEqual(a,b){const aa=Buffer.from(String(a)),bb=Buffer.from(String(b));return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb);}
function sign(raw){return crypto.createHmac("sha256",SECRET).update(raw).digest("hex");}
function token(req){const c=(req.headers.cookie||"").split(";").map(x=>x.trim()).find(x=>x.startsWith("vl_admin="));return c?decodeURIComponent(c.slice(9)):"";}
function isOwner(req){const t=token(req);if(!t.includes("."))return false;const[e,s]=t.split(".");let raw="";try{raw=Buffer.from(e,"base64url").toString();}catch{return false;}if(!safeEqual(s,sign(raw)))return false;const[u,expires,effective]=raw.split("|");return u===OWNER&&Number(expires)>Date.now()&&(!effective||effective===OWNER);}
function sameOrigin(req){const o=req.headers.origin;if(!o)return true;try{return new URL(o).host===req.headers.host;}catch{return false;}}
function body(req,max=300000){return new Promise((ok,no)=>{let b="";req.on("data",c=>{b+=c;if(b.length>max)no(new Error("Request too large"));});req.on("end",()=>{try{ok(b?JSON.parse(b):{})}catch{no(new Error("Invalid request"))}});req.on("error",no)});}
function clean(v,max){return String(v||"").trim().replace(/\s+/g," ").slice(0,max);}
function emailOk(v){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);}
function mobileOk(v){return /^(?:\+44|0)7\d{9}$/.test(v.replace(/[\s()-]/g,""));}
function normalizePhone(v){let p=String(v||"").trim().replace(/[\s()-]/g,"");if(p.startsWith("0044"))p="+44"+p.slice(4);else if(p.startsWith("0"))p="+44"+p.slice(1);else if(/^44\d+$/.test(p))p="+"+p;if(!/^\+[1-9]\d{7,14}$/.test(p))throw new Error("Invalid mobile number");return p;}
function csv(data){const q=v=>`"${String(v??"").replace(/"/g,'""')}"`;return ['Name,Email,Mobile,Consent date,Status,Source',...data.entries.map(e=>[e.name,e.email,e.mobile,e.consentAt,e.unsubscribedAt?'Unsubscribed':'Active',e.source||'keep-in-touch'].map(q).join(','))].join('\n');}
function activeEntries(data){return data.entries.filter(e=>e.consent===true&&!e.unsubscribedAt&&emailOk(String(e.email||""))&&mobileOk(String(e.mobile||"")));}
function unsubscribeToken(entry){const id=String(entry.id||"");const sig=crypto.createHmac("sha256",SECRET).update(`kit-unsub|${id}`).digest("base64url").slice(0,20);return `${id}.${sig}`;}
function parseUnsubscribeToken(t){const [id,sig]=String(t||"").split(".");if(!id||!sig)return null;const expected=crypto.createHmac("sha256",SECRET).update(`kit-unsub|${id}`).digest("base64url").slice(0,20);return safeEqual(sig,expected)?id:null;}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));}
function unsubscribeUrl(entry){return `${SITE}/u/${encodeURIComponent(unsubscribeToken(entry))}`;}
function unsubscribePage(ok){return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${ok?'Unsubscribed':'Unable to unsubscribe'} | Village Limits</title><style>body{font-family:Arial,sans-serif;background:#f4f1eb;color:#222;margin:0}.box{max-width:620px;margin:10vh auto;background:#fff;padding:40px;border-radius:12px;text-align:center}.box img{max-width:240px}.box a{display:inline-block;margin-top:18px;color:#8a6d34}</style></head><body><main class="box"><img src="/assets/images/logo-gold.png" alt="Village Limits"><h1>${ok?'You have been unsubscribed':'We could not find that subscription'}</h1><p>${ok?'You will no longer receive Keep in Touch promotional messages from Village Limits.':'Please contact Village Limits if you would like us to update your marketing preferences.'}</p><a href="/">Return to Village Limits</a></main></body></html>`;}

async function graphToken(){
  if(!MS_TENANT_ID||!MS_CLIENT_ID||!MS_CLIENT_SECRET)throw new Error("Email sending is not configured in Azure.");
  const form=new URLSearchParams({client_id:MS_CLIENT_ID,client_secret:MS_CLIENT_SECRET,scope:"https://graph.microsoft.com/.default",grant_type:"client_credentials"});
  const r=await fetch(`https://login.microsoftonline.com/${encodeURIComponent(MS_TENANT_ID)}/oauth2/v2.0/token`,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:form});
  const j=await r.json().catch(()=>({}));if(!r.ok||!j.access_token)throw new Error("Unable to authenticate the website email service.");return j.access_token;
}
async function sendEmailOne(accessToken,entry,subject,message){
  const optout=unsubscribeUrl(entry);
  const html=`<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#222"><div style="text-align:center;padding:18px"><img src="${SITE}/assets/images/logo-gold.png" alt="Village Limits" style="max-width:250px;max-height:100px"></div><p>Hello ${esc(String(entry.name||"").split(/\s+/)[0]||"there")},</p><div style="white-space:pre-line;line-height:1.55">${esc(message)}</div><p style="margin-top:28px;color:#666;font-size:12px">You are receiving this because you asked to receive Village Limits offers, discounts and news. <a href="${esc(optout)}">Unsubscribe</a>.</p></div>`;
  const payload={message:{subject,body:{contentType:"HTML",content:html},toRecipients:[{emailAddress:{address:entry.email,name:entry.name||""}}]},saveToSentItems:true};
  const r=await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(MARKETING_SENDER)}/sendMail`,{method:"POST",headers:{Authorization:`Bearer ${accessToken}`,"Content-Type":"application/json"},body:JSON.stringify(payload)});
  if(r.status!==202){const detail=await r.text();throw new Error(`Email failed (${r.status}) ${detail.slice(0,120)}`);}
}
async function sendSmsOne(sender,entry,message){
  if(!WEBEX_TOKEN)throw new Error("Webex SMS is not configured in Azure.");
  const text=`${message}\nOpt out: ${unsubscribeUrl(entry)}`.trim();
  if(text.length>1200)throw new Error("SMS message is too long after adding the opt-out link.");
  const r=await fetch(WEBEX_ENDPOINT,{method:"POST",headers:{"Content-Type":"application/json","X-AUTH-KEY":WEBEX_TOKEN},body:JSON.stringify({message_body:text,from:sender,to:[{correlation_id:`marketing-${entry.id}`.slice(0,100),phone:[normalizePhone(entry.mobile)]}]})});
  const j=await r.json().catch(()=>({}));if(!r.ok){const detail=Array.isArray(j.errors)&&j.errors[0]?.message?j.errors[0].message:"Webex rejected the message.";throw new Error(detail);}
}
async function runLimited(entries,limit,fn){
  const results=[];let index=0;
  async function worker(){while(index<entries.length){const i=index++;const entry=entries[i];try{await fn(entry);results[i]={id:entry.id,ok:true};}catch(err){results[i]={id:entry.id,ok:false,error:String(err.message||err).slice(0,250)};}}}
  await Promise.all(Array.from({length:Math.min(limit,entries.length||1)},worker));return results;
}

function injectAdmin(html){
  const panel=`<section id="panel-keep-in-touch" class="admin-panel" hidden><div class="admin-heading"><div><span class="eyebrow">Marketing</span><h1>Keep in Touch</h1></div><div class="actions"><button id="refreshKeepInTouch" class="btn dark" type="button">Refresh</button><a class="btn" href="/api/admin/keep-in-touch/export">Export CSV</a></div></div><p id="keepInTouchMeta" class="save-status"></p><div class="admin-card" style="margin-bottom:18px"><h3>Send a promotion</h3><p>Send to everyone who is currently opted in. You can use SMS, email, or both.</p><div class="row-2"><label>Email subject<input id="kitCampaignSubject" maxlength="150" placeholder="Village Limits offer"></label><label>SMS sender<select id="kitSmsSender"><option value="VLimits">VLimits</option><option value="+447860008022">07860 008022</option></select></label></div><label>Message<textarea id="kitCampaignMessage" rows="7" maxlength="1100" placeholder="Write your offer, discount or event update here..."></textarea></label><div class="actions" style="align-items:center"><label style="display:flex;gap:6px;align-items:center"><input id="kitSendEmail" type="checkbox" checked> Email</label><label style="display:flex;gap:6px;align-items:center"><input id="kitSendSms" type="checkbox"> SMS</label><button id="kitSendCampaign" class="btn dark" type="button">Review &amp; Send</button></div><p id="kitCampaignStatus" class="save-status"></p></div><div id="keepInTouchRows"></div></section>`;
  return html.replace('</aside>','<button data-panel="keep-in-touch">Keep in Touch</button></aside>').replace('</main>',`${panel}</main>`).replace('</body>','<script src="/assets/js/keep-in-touch-admin.js?v=1.1.0"></script></body>');
}

async function handle(req,res,pathname){
  if(pathname==="/keep-in-touch"&&req.method==="GET"){res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"});res.end(fs.readFileSync(PAGE,"utf8"));return true;}
  if(pathname.startsWith("/u/")&&req.method==="GET"){
    const id=parseUnsubscribeToken(decodeURIComponent(pathname.slice(3)));const data=read();const entry=id?data.entries.find(e=>e.id===id):null;
    if(entry&&!entry.unsubscribedAt){entry.unsubscribedAt=new Date().toISOString();entry.consent=false;entry.updatedAt=entry.unsubscribedAt;write(data);}
    res.writeHead(entry?200:404,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"});res.end(unsubscribePage(Boolean(entry)));return true;
  }
  if(pathname==="/api/keep-in-touch/signup"&&req.method==="POST"){
    if(!sameOrigin(req)){json(res,403,{error:"Invalid request origin."});return true;}
    const b=await body(req);const name=clean(b.name,100),email=clean(b.email,160).toLowerCase(),mobile=clean(b.mobile,30);
    if(name.length<2){json(res,400,{error:"Please enter your name."});return true;}if(!emailOk(email)){json(res,400,{error:"Please enter a valid email address."});return true;}if(!mobileOk(mobile)){json(res,400,{error:"Please enter a valid UK mobile number."});return true;}if(b.marketingConsent!==true){json(res,400,{error:"Please confirm that you are happy to receive Village Limits marketing."});return true;}if(String(b.website||"").trim()){json(res,200,{ok:true});return true;}
    const data=read(),now=new Date().toISOString(),normalMobile=mobile.replace(/[\s()-]/g,"");const found=data.entries.find(e=>e.email===email||String(e.mobile||"").replace(/[\s()-]/g,"")===normalMobile);
    if(found)Object.assign(found,{name,email,mobile,consent:true,consentAt:now,consentVersion:"2026-09-v1",source:"keep-in-touch",unsubscribedAt:null,updatedAt:now});else data.entries.push({id:crypto.randomUUID(),name,email,mobile,consent:true,consentAt:now,consentVersion:"2026-09-v1",source:"keep-in-touch",unsubscribedAt:null,createdAt:now,updatedAt:now});write(data);json(res,200,{ok:true});return true;
  }
  if(pathname==="/api/admin/keep-in-touch"&&req.method==="GET"){
    if(!isOwner(req)){json(res,403,{error:"Owner access required."});return true;}const data=read(),active=activeEntries(data);json(res,200,{count:data.entries.length,activeCount:active.length,entries:[...data.entries].sort((a,b)=>String(b.consentAt).localeCompare(String(a.consentAt))),smsConfigured:Boolean(WEBEX_TOKEN),emailConfigured:Boolean(MS_TENANT_ID&&MS_CLIENT_ID&&MS_CLIENT_SECRET&&MARKETING_SENDER),marketingSender:MARKETING_SENDER,campaigns:data.campaigns.slice(-10).reverse()});return true;
  }
  if(pathname==="/api/admin/keep-in-touch/campaign"&&req.method==="POST"){
    if(!isOwner(req)){json(res,403,{error:"Owner access required."});return true;}if(!sameOrigin(req)){json(res,403,{error:"Invalid request origin."});return true;}
    const b=await body(req);const sendEmail=b.sendEmail===true,sendSms=b.sendSms===true;const subject=clean(b.subject,150),message=String(b.message||"").trim().slice(0,1100);const sender=SMS_SENDERS.get(String(b.smsSender||"VLimits"));
    if(!sendEmail&&!sendSms){json(res,400,{error:"Choose email, SMS, or both."});return true;}if(!message){json(res,400,{error:"Please enter a campaign message."});return true;}if(sendEmail&&!subject){json(res,400,{error:"Please enter an email subject."});return true;}if(sendSms&&!sender){json(res,400,{error:"Please choose a valid SMS sender."});return true;}if(sendEmail&&!(MS_TENANT_ID&&MS_CLIENT_ID&&MS_CLIENT_SECRET)){json(res,400,{error:"Email sending is not configured in Azure."});return true;}if(sendSms&&!WEBEX_TOKEN){json(res,400,{error:"Webex SMS is not configured in Azure."});return true;}
    const data=read(),recipients=activeEntries(data);if(!recipients.length){json(res,400,{error:"There are no active opted-in recipients."});return true;}
    let emailResults=[],smsResults=[];
    if(sendEmail){const access=await graphToken();emailResults=await runLimited(recipients,5,e=>sendEmailOne(access,e,subject,message));}
    if(sendSms)smsResults=await runLimited(recipients,3,e=>sendSmsOne(sender,e,message));
    const summary={id:crypto.randomUUID(),sentAt:new Date().toISOString(),subject:sendEmail?subject:"",message,channels:{email:sendEmail,sms:sendSms},recipientCount:recipients.length,email:{sent:emailResults.filter(x=>x.ok).length,failed:emailResults.filter(x=>!x.ok).length},sms:{sent:smsResults.filter(x=>x.ok).length,failed:smsResults.filter(x=>!x.ok).length}};
    data.campaigns.push(summary);if(data.campaigns.length>100)data.campaigns=data.campaigns.slice(-100);write(data);
    json(res,200,{ok:true,...summary,failures:{email:emailResults.filter(x=>!x.ok).slice(0,10),sms:smsResults.filter(x=>!x.ok).slice(0,10)}});return true;
  }
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
  }catch(err){console.error("Keep in Touch error",err);if(!res.headersSent)json(res,500,{error:String(err.message||"Request failed.")});else res.end();}};return serverOptions===undefined?original.call(http,wrapped):original.call(http,serverOptions,wrapped);};

require("./stocktake-entry");
