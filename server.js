const http=require("http"),fs=require("fs"),path=require("path"),crypto=require("crypto");
const PORT=process.env.PORT||8080,ROOT=path.join(__dirname,"public"),DEFAULT=path.join(__dirname,"data","default-content.json");
const DATA_DIR=process.env.CONTENT_DATA_DIR||(process.env.HOME?path.join(process.env.HOME,"site","data"):path.join(__dirname,"data")),CONTENT=path.join(DATA_DIR,"content.json"),UPLOADS_DIR=path.join(DATA_DIR,"uploads");
const USER=process.env.ADMIN_USERNAME||"admin",PASS=process.env.ADMIN_PASSWORD||"ChangeMe-Immediately",SECRET=process.env.SESSION_SECRET||"replace-this-secret";
const MS_TENANT_ID=process.env.MS_TENANT_ID||"",MS_CLIENT_ID=process.env.MS_CLIENT_ID||"",MS_CLIENT_SECRET=process.env.MS_CLIENT_SECRET||"";
const EVENT_SENDER=process.env.EVENT_SENDER||"events@villagelimits.co.uk",EVENT_ENQUIRY_TO=process.env.EVENT_ENQUIRY_TO||"events@villagelimits.co.uk";
const BUILD=process.env.GITHUB_SHA?process.env.GITHUB_SHA.slice(0,7):"local",VERSION="2.3.1",SITE=(process.env.PUBLIC_SITE_URL||"https://www.villagelimits.co.uk").replace(/\/+$/,""),AV=encodeURIComponent(`${VERSION}-${BUILD}`);
const mime={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"application/javascript; charset=utf-8",".json":"application/json; charset=utf-8",".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",".webp":"image/webp",".svg":"image/svg+xml"};
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
function ensure(){fs.mkdirSync(DATA_DIR,{recursive:true});fs.mkdirSync(UPLOADS_DIR,{recursive:true});if(!fs.existsSync(CONTENT))fs.copyFileSync(DEFAULT,CONTENT)}
function read(){ensure();try{return JSON.parse(fs.readFileSync(CONTENT,"utf8").replace(/^\uFEFF/,""))}catch(e){fs.copyFileSync(DEFAULT,CONTENT);return JSON.parse(fs.readFileSync(DEFAULT,"utf8").replace(/^\uFEFF/,""))}}
function write(c){ensure();const t=CONTENT+".tmp";fs.writeFileSync(t,JSON.stringify(c,null,2),"utf8");fs.renameSync(t,CONTENT)}
function saveUploadedImage(payload){
  ensure();
  const allowed={"image/jpeg":".jpg","image/png":".png","image/webp":".webp"};
  const mt=String(payload.mime||"").toLowerCase(),ext=allowed[mt];
  if(!ext)throw new Error("Please upload a JPG, PNG or WebP image.");
  const raw=String(payload.data||"");
  if(!raw)throw new Error("No image data received.");
  const buf=Buffer.from(raw,"base64");
  if(!buf.length)throw new Error("The selected image is empty.");
  if(buf.length>6*1024*1024)throw new Error("Image must be 6 MB or smaller.");
  const base=String(payload.filename||"event").replace(/\.[^.]+$/,"").replace(/[^a-z0-9_-]+/gi,"-").replace(/^-+|-+$/g,"").slice(0,60)||"event";
  const name=`${Date.now()}-${crypto.randomBytes(4).toString("hex")}-${base}${ext}`;
  fs.writeFileSync(path.join(UPLOADS_DIR,name),buf);
  return `/uploads/${name}`;
}
async function graphToken(){
 const body=new URLSearchParams({client_id:MS_CLIENT_ID,client_secret:MS_CLIENT_SECRET,scope:"https://graph.microsoft.com/.default",grant_type:"client_credentials"});
 if(!MS_TENANT_ID||!MS_CLIENT_ID||!MS_CLIENT_SECRET)throw new Error("Christmas enquiry email is not configured.");
 const r=await fetch(`https://login.microsoftonline.com/${encodeURIComponent(MS_TENANT_ID)}/oauth2/v2.0/token`,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body});
 const j=await r.json(); if(!r.ok||!j.access_token)throw new Error("Unable to authenticate the website email service."); return j.access_token;
}
async function sendChristmasEnquiry(q){
 const token=await graphToken();
 const text=[`Name: ${q.name}`,`Email: ${q.email}`,`Phone: ${q.phone}`,`Preferred date: ${q.preferredDate}`,`Number in party: ${q.partySize}`,q.message?`Additional information: ${q.message}`:""].filter(Boolean).join("\n");
 const payload={message:{subject:`Christmas Party Enquiry - ${q.name} - ${q.preferredDate}`,body:{contentType:"Text",content:text},toRecipients:[{emailAddress:{address:EVENT_ENQUIRY_TO}}],replyTo:[{emailAddress:{address:q.email,name:q.name}}]},saveToSentItems:true};
 const r=await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(EVENT_SENDER)}/sendMail`,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify(payload)});
 if(!r.ok){const details=await r.text();console.error("Christmas enquiry email failed",r.status,details);throw new Error("We could not send your enquiry just now.");}
}
async function sendAfternoonTeaEnquiry(q){
  const token=await graphToken();
  const lines=[
    "New Afternoon Tea enquiry from villagelimits.co.uk",
    "",
    `Name: ${q.name}`,
    `Email: ${q.email}`,
    `Phone: ${q.phone}`,
    `Preferred date: ${q.preferredDate}`,
    `Preferred time: ${q.preferredTime}`,
    `Number in party: ${q.partySize}`,
    `Package: ${q.packageName}`,
    `Premium canap&eacute; selection: ${q.canapes?"Yes":"No"}`,
    q.dietary?`Dietary requirements / allergens: ${q.dietary}`:"",
    q.message?`Additional information: ${q.message}`:""
  ].filter(Boolean).join("\n");

  const payload={
    message:{
      subject:`Afternoon Tea Enquiry - ${q.name} - ${q.preferredDate}`,
      body:{contentType:"Text",content:lines},
      toRecipients:[{emailAddress:{address:EVENT_ENQUIRY_TO}}],
      replyTo:[{emailAddress:{address:q.email,name:q.name}}]
    },
    saveToSentItems:true
  };

  const r=await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(EVENT_SENDER)}/sendMail`,
    {
      method:"POST",
      headers:{
        Authorization:`Bearer ${token}`,
        "Content-Type":"application/json"
      },
      body:JSON.stringify(payload)
    }
  );

  if(!r.ok){
    const details=await r.text();
    console.error("Afternoon Tea email failed",r.status,details);
    throw new Error("We could not send your enquiry just now.");
  }
}

async function sendTestEmail(){
  const token=await graphToken();
  const payload={
    message:{
      subject:"Village Limits Website Email Test",
      body:{
        contentType:"Text",
        content:"This is a test email sent from the Village Limits website through Microsoft Graph. If you received this, the website email configuration is working."
      },
      toRecipients:[{emailAddress:{address:EVENT_ENQUIRY_TO}}]
    },
    saveToSentItems:true
  };
  const r=await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(EVENT_SENDER)}/sendMail`,{
    method:"POST",
    headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},
    body:JSON.stringify(payload)
  });
  if(!r.ok){
    const details=await r.text();
    console.error("Website email test failed",r.status,details);
    throw new Error(`Microsoft Graph returned ${r.status}: ${details.slice(0,800)}`);
  }
}

function json(res,code,b){res.writeHead(code,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"});res.end(JSON.stringify(b))}
function html(res,b,code=200,h={}){res.writeHead(code,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store",...h});res.end(b)}
function body(req){return new Promise((ok,no)=>{let b="";req.on("data",c=>{b+=c;if(b.length>1e6)no(new Error("Request too large"))});req.on("end",()=>{try{ok(b?JSON.parse(b):{})}catch{no(new Error("Invalid JSON"))}});req.on("error",no)})}
function largeBody(req,max=8500000){return new Promise((ok,no)=>{let b="";req.on("data",c=>{b+=c;if(b.length>max){no(new Error("Image upload is too large"));req.destroy()}});req.on("end",()=>{try{ok(b?JSON.parse(b):{})}catch{no(new Error("Invalid upload data"))}});req.on("error",no)})}
function formBody(req){return new Promise((ok,no)=>{let b="";req.on("data",c=>{b+=c;if(b.length>1e5)no(new Error("Request too large"))});req.on("end",()=>{try{const p=new URLSearchParams(b);ok(Object.fromEntries(p.entries()))}catch{no(new Error("Invalid form"))}});req.on("error",no)})}
function loginPage(error=false){return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Website Administration | Village Limits</title><meta name="robots" content="noindex,nofollow,noarchive"><link rel="stylesheet" href="/assets/css/styles.css?v=2.1.7"></head><body class="admin-body"><div class="admin-login"><div class="login-card"><img src="/assets/images/logo-gold.png" alt="Village Limits"><div class="eyebrow">Version 2.1.7</div><h1>Website administration</h1><p>Sign in to manage menus, events and website details.</p>${error?'<p class="form-error" role="alert">Incorrect username or password</p>':""}<form method="post" action="/admin/login"><label>Username<input name="username" required autocomplete="username"></label><label>Password<input name="password" type="password" required autocomplete="current-password"></label><button class="btn" type="submit">Sign in</button></form></div></div></body></html>`}
function seedMainMenu(){
  const c=read();
  if(c.mainMenuSeed==="2026-08-main-menu") return;
  const menuPath=path.join(__dirname,"main-menu.json");
  if(!fs.existsSync(menuPath)) return;
  const main=JSON.parse(fs.readFileSync(menuPath,"utf8").replace(/^\uFEFF/,""));
  const i=c.menus.findIndex(m=>m.id==="main");
  if(i>=0)c.menus[i]=main; else c.menus.unshift(main);
  c.mainMenuSeed="2026-08-main-menu";
  write(c);
}
function migrateEventSeo(){
  const c=read();
  if(c.eventSeoSeed==="2.1.5") return;
  c.events=(c.events||[]).map(e=>{
    e.startDate=e.startDate||"";
    e.endDate=e.endDate||"";
    e.price=e.price??"";
    e.currency=e.currency||"GBP";
    e.image=e.image||"/assets/images/event.webp";
    e.eventStatus=e.eventStatus||"EventScheduled";
    e.performer=e.performer||"";
    if(/psychic/i.test(e.title||"")&&!e.startDate){
      e.startDate="2026-11-30T18:30:00+00:00";
      if(e.price==="") e.price="30";
    }
    return e;
  });
  c.eventSeoSeed="2.1.5";
  write(c);
}
function sign(v){return crypto.createHmac("sha256",SECRET).update(v).digest("hex")} function make(){const r=`${USER}|${Date.now()+28800000}`;return `${Buffer.from(r).toString("base64url")}.${sign(r)}`}
function tok(req){const a=req.headers.authorization||"";if(a.startsWith("Bearer "))return a.slice(7);const c=(req.headers.cookie||"").split(";").map(x=>x.trim()).find(x=>x.startsWith("vl_admin="));return c?decodeURIComponent(c.slice(9)):""}
function valid(req){const t=tok(req);if(!t.includes("."))return false;const[e,s]=t.split(".");let r="";try{r=Buffer.from(e,"base64url").toString()}catch{return false}const x=sign(r);if(s.length!==x.length||!crypto.timingSafeEqual(Buffer.from(s),Buffer.from(x)))return false;const[u,d]=r.split("|");return u===USER&&Number(d)>Date.now()}
function canonicalRedirect(req,res,url){
  const host=String(req.headers.host||"").split(":")[0].toLowerCase();
  const canonicalHost="www.villagelimits.co.uk";
  const isCanonical=host===canonicalHost;
  const isRoot=host==="villagelimits.co.uk";
  const isAzure=host.endsWith(".azurewebsites.net");
  if(!isCanonical&&(isRoot||isAzure)){
    const target=`https://${canonicalHost}${url.pathname}${url.search}`;
    const status=(req.method==="GET"||req.method==="HEAD")?301:308;
    res.writeHead(status,{
      "Location":target,
      "Cache-Control":"public, max-age=3600"
    });
    res.end();
    return true;
  }
  return false;
}
function header(){return `<header class="site-header"><div class="container nav"><a class="brand" href="/"><img src="/assets/images/logo-white.png" alt="Village Limits"></a><button class="menu-toggle" aria-label="Open menu">&#9776;</button><nav class="navlinks"><a href="/eat">Eat</a><a href="/stay">Stay</a><a href="/whats-on">What's On</a><a href="/christmas">Christmas</a><a href="/afternoon-tea">Afternoon Tea</a><a href="/private-events">Private Events</a><a href="/contact">Contact</a><a href="/book-table">Book a Table</a></nav><a class="btn" href="/stay">Book</a></div></header>`}
function footer(c){return `<footer class="footer"><div class="container footer-grid"><div><img src="/assets/images/logo-white.png" alt="Village Limits"><p>A warm welcome, memorable dining, comfortable rooms and entertaining evenings in Woodhall Spa.</p></div><div><div class="eyebrow">Contact</div><p>${esc(c.settings.telephone)}<br>${esc(c.settings.email)}</p></div><div><div class="eyebrow">Opening</div><p>${esc(c.settings.openingHours)}</p></div></div><div class="container footer-bottom"><small>Village Limits Platform &middot; Version ${VERSION} &middot; Build ${BUILD}</small></div></footer>`}
function schema(c){return {"@context":"https://schema.org","@graph":[{"@type":"Restaurant","name":"Village Limits","url":SITE,"image":`${SITE}/assets/images/hero.webp`,"telephone":c.settings.telephone,"address":{"@type":"PostalAddress","addressLocality":"Woodhall Spa","addressRegion":"Lincolnshire","addressCountry":"GB"}},{"@type":"LodgingBusiness","name":"Village Limits Accommodation","url":`${SITE}/stay`,"image":`${SITE}/assets/images/rooms.webp`,"telephone":c.settings.telephone,"address":{"@type":"PostalAddress","addressLocality":"Woodhall Spa","addressRegion":"Lincolnshire","addressCountry":"GB"}}]}}
function eventUrl(e){return `${SITE}/event/${encodeURIComponent(e.id)}`}
function eventSchema(c,e){
  if(!e||!e.startDate)return null;
  const item={
    "@context":"https://schema.org",
    "@type":"Event",
    "name":e.title,
    "startDate":e.startDate,
    "eventStatus":`https://schema.org/${e.eventStatus||"EventScheduled"}`,
    "eventAttendanceMode":"https://schema.org/OfflineEventAttendanceMode",
    "location":{
      "@type":"Place",
      "name":"Village Limits",
      "address":{
        "@type":"PostalAddress",
        "streetAddress":c.settings.address||"Village Limits",
        "addressLocality":"Woodhall Spa",
        "addressRegion":"Lincolnshire",
        "addressCountry":"GB"
      }
    },
    "description":e.description||e.title,
    "image":[`${SITE}${e.image||"/assets/images/event.webp"}`],
    "url":eventUrl(e),
    "organizer":{"@type":"Organization","name":"Village Limits","url":SITE}
  };
  if(e.endDate)item.endDate=e.endDate;
  if(e.performer)item.performer={"@type":"Person","name":e.performer};
  if(e.ticketUrl){
    item.offers={
      "@type":"Offer",
      "url":e.ticketUrl,
      "priceCurrency":e.currency||"GBP",
      "availability":"https://schema.org/InStock"
    };
    if(e.price!=="")item.offers.price=Number(e.price);
  }
  return item;
}
function shell(t,d,p,b,robots="index,follow",og="/assets/images/hero.webp",extraSchema=null){const c=read(),can=`${SITE}${p}`;return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(t)}</title><meta name="description" content="${esc(d)}"><meta name="robots" content="${robots}"><link rel="canonical" href="${esc(can)}"><meta property="og:type" content="website"><meta property="og:title" content="${esc(t)}"><meta property="og:description" content="${esc(d)}"><meta property="og:url" content="${esc(can)}"><meta property="og:image" content="${esc(SITE+og)}"><meta name="twitter:card" content="summary_large_image"><link rel="stylesheet" href="/assets/css/styles.css?v=${AV}"><script type="application/ld+json">${JSON.stringify(extraSchema||schema(c)).replace(/</g,"\\u003c")}</script></head><body>${header()}${b}${footer(c)}<script src="/assets/js/site.js?v=${AV}"></script></body></html>`}
function ph(e,h,p){return `<section class="page-hero"><div class="container"><div class="eyebrow">${esc(e)}</div><h1>${esc(h)}</h1><p>${esc(p)}</p></div></section>`}
function home(){const c=read(),f=c.events.filter(e=>e.visible&&e.featured);return shell("Village Limits | Restaurant, Accommodation & Entertainment in Woodhall Spa","Dine, stay and enjoy live entertainment at Village Limits in Woodhall Spa, Lincolnshire. Restaurant dining, Sunday lunch, air-conditioned accommodation and special events.","/",`<section class="home-hero"><img class="hero-bg" src="/assets/images/hero.webp" alt="Village Limits restaurant and accommodation in Woodhall Spa"><div class="shade"></div><div class="container hero-copy"><img src="/assets/images/logo-white.png" alt="Village Limits"><div class="eyebrow">Woodhall Spa, Lincolnshire</div><h1 class="home-hero-title">Dine. Stay.<br>Make an evening of it.</h1><p>Thoughtful food, welcoming rooms and entertainment worth leaving home for.</p><div class="actions"><a class="btn" href="/book-table">Book a Table</a><a class="btn outline-light" href="/stay">Book Accommodation</a><a class="btn outline-light" href="/whats-on">What's On</a></div></div></section><section class="section"><div class="container split"><div class="image-card"><img src="/assets/images/rooms.webp" alt="Air-conditioned guest accommodation at Village Limits"><span>Air-conditioned rooms</span></div><div><div class="eyebrow">Stay at Village Limits</div><h2>Accommodation in Woodhall Spa</h2><p class="lead">Comfortable accommodation, direct booking and everything you need for a relaxing stay.</p><ul class="feature-list accommodation-features"><li>Air-conditioned guest rooms</li><li>Free parking and Wi-Fi</li><li>Breakfast available</li><li>Restaurant and entertainment on site <strong>Wednesday to Sunday</strong></li></ul><div class="actions"><a class="btn large" href="/stay">View Accommodation</a><a class="btn dark" target="_blank" rel="noopener" href="https://direct-book.com/properties/VillageLimitsMotelDirect?locale=en&items[0][adults]=2&items[0][children]=0&items[0][infants]=0&currency=GBP&trackPage=yes">Check Availability</a></div></div></div></section><section class="section alt"><div class="container three-grid"><a class="feature-card" href="/eat" style="background-image:url('/assets/images/food1.webp')"><div><div class="eyebrow">Eat</div><h3>Restaurant dining in Woodhall Spa</h3></div></a><a class="feature-card" href="/stay" style="background-image:url('/assets/images/rooms.webp')"><div><div class="eyebrow">Stay</div><h3>Comfortable rooms</h3></div></a><a class="feature-card" href="/whats-on" style="background-image:url('/assets/images/event.webp')"><div><div class="eyebrow">What's On</div><h3>Live entertainment and events</h3></div></a></div></section><section class="section"><div class="container split"><img src="/assets/images/interior.webp" alt="Dining interior at Village Limits"><div><div class="eyebrow">Warmly different</div><h2>A place where every visit feels special</h2><p class="lead">Join us for a relaxed meal, celebrate an occasion, enjoy an evening of entertainment or stay a little longer.</p></div></div></section><section class="section alt"><div class="container"><div class="eyebrow">Coming up</div><h2>What's on at Village Limits</h2><div class="event-grid">${f.map(e=>`<article class="event-card"><div class="eyebrow">${esc(e.date)}</div><h3>${esc(e.title)}</h3><p>${esc(e.description)}</p><a class="btn" href="${esc(e.ticketUrl)}" target="_blank" rel="noopener">Buy Tickets</a></article>`).join("")}</div></div></section>`)}
function eat(){const c=read(),cards=c.menus.filter(m=>m.visible).map(m=>`<a class="menu-card" href="/menu/${encodeURIComponent(m.id)}"><div class="eyebrow">View menu</div><h2>${esc(m.name)}</h2><p>${esc(m.description)}</p><span class="btn">Open ${esc(m.name)}</span></a>`).join("");return shell("Menus | Village Limits Restaurant Woodhall Spa","Explore the current menus at Village Limits in Woodhall Spa, including the main menu, Sunday lunch, specials and desserts.","/eat",`${ph("Restaurant","Our menus","Choose from our current menus.")}<section class="section"><div class="container menu-grid">${cards}</div></section>`)}
function menu(id){const c=read(),m=c.menus.find(x=>x.id===id&&x.visible);if(!m)return shell("Menu unavailable | Village Limits","This Village Limits menu is currently unavailable.",`/menu/${encodeURIComponent(id)}`,ph("Menus","Menu unavailable","This menu is currently hidden."),"noindex,follow");const s=(m.sections||[]).map(x=>`<section class="menu-section"><div class="eyebrow">${esc(x.name)}</div><h2>${esc(x.name)}</h2>${(x.items||[]).filter(i=>i.visible!==false).map(i=>`<article class="dish"><div class="dish-row"><h3>${esc(i.name)}</h3><strong>${esc(i.price)}</strong></div>${i.description?`<p>${esc(i.description)}</p>`:""}${i.allergens?`<small>Allergens: ${esc(i.allergens)}</small>`:""}</article>`).join("")}</section>`).join("");return shell(`${m.name} | Village Limits Woodhall Spa`,`View the ${m.name} at Village Limits restaurant in Woodhall Spa. ${m.description||""}`,`/menu/${encodeURIComponent(m.id)}`,`${ph("Menu",m.name,m.description)}<section class="section"><div class="container narrow">${s}</div></section>`)}
function stay(){const u="https://direct-book.com/properties/VillageLimitsMotelDirect?locale=en&items[0][adults]=2&items[0][children]=0&items[0][infants]=0&currency=GBP&trackPage=yes";return shell("Accommodation in Woodhall Spa | Village Limits","Book comfortable, air-conditioned accommodation at Village Limits in Woodhall Spa, Lincolnshire, with free parking, Wi-Fi and direct online booking.","/stay",`${ph("Accommodation","Stay at Village Limits","Comfortable, air-conditioned rooms in Woodhall Spa.")}<section class="section"><div class="container split"><img src="/assets/images/rooms.webp" alt="Village Limits guest accommodation in Woodhall Spa"><div><h2>Check availability and book your stay</h2><p class="lead">Stay on site and make more of your visit to Woodhall Spa.</p><a class="btn large" target="_blank" rel="noopener" href="${u}">Check Availability & Book</a></div></div></section>`,"index,follow","/assets/images/rooms.webp")}
function events(){
  const c=read(),v=c.events.filter(e=>e.visible);
  return shell(
    "What's On & Live Entertainment | Village Limits Woodhall Spa",
    "Discover live entertainment, dining events and special evenings at Village Limits in Woodhall Spa.",
    "/whats-on",
    `${ph("Entertainment","What's On","Dinner, live music and special evenings.")}
    <section class="section"><div class="container event-grid">
    ${v.map(e=>`<article class="event-card">
      <div class="eyebrow">${esc(e.date)}</div>
      <h2>${esc(e.title)}</h2>
      <p>${esc(e.description)}</p>
      <div class="actions">
        <a class="btn" href="/event/${encodeURIComponent(e.id)}">Event Details</a>
        ${e.ticketUrl?`<a class="btn dark" href="${esc(e.ticketUrl)}" target="_blank" rel="noopener">Buy Tickets</a>`:""}
      </div>
    </article>`).join("")}
    </div></section>`
  )
}

function eventDetail(id){
 const c=read(),e=c.events.find(x=>x.id===id&&x.visible);
 if(!e)return shell("Event unavailable | Village Limits","This event is currently unavailable.",`/event/${encodeURIComponent(id)}`,ph("What's On","Event unavailable","This event is no longer available."),"noindex,follow");
 const sc=eventSchema(c,e);
 const price=e.price!==""?`<p><strong>Price:</strong> &pound;${esc(e.price)} per person</p>`:"";
 return shell(`${e.title} | Village Limits Woodhall Spa`,`${e.description} Book ${e.title} at Village Limits in Woodhall Spa.`,`/event/${encodeURIComponent(e.id)}`,
 `${ph("What's On",e.title,e.date)}<section class="section event-detail"><div class="container narrow"><img class="event-detail-image" src="${esc(e.image||"/assets/images/event.webp")}" alt="${esc(e.title)} at Village Limits"><h2>${esc(e.title)}</h2><p class="lead">${esc(e.description)}</p><p><strong>Date:</strong> ${esc(e.date)}</p>${price}${e.ticketUrl?`<p><a class="btn large" href="${esc(e.ticketUrl)}" target="_blank" rel="noopener">Book / Buy Tickets</a></p>`:""}<p><a href="/whats-on">&larr; Back to What's On</a></p></div></section>`,
 "index,follow",e.image||"/assets/images/event.webp",sc||schema(c))
}
function book(){return shell("Book a Table | Village Limits Restaurant Woodhall Spa","Reserve a table at Village Limits restaurant in Woodhall Spa using our secure online table booking system.","/book-table",`${ph("Restaurant","Book a Table","Reserve your table using our secure booking system.")}<section class="section"><div class="container booking-box"><script src="https://touchreservation.net/customer/javascript/embed.js?coalias=villagelimits&site=1"></script></div></section>`)}
function contact(){const c=read();return shell("Contact Village Limits | Woodhall Spa","Contact Village Limits in Woodhall Spa for restaurant reservations, accommodation, events and private functions.","/contact",`${ph("Contact","Get in touch","We look forward to welcoming you.")}<section class="section"><div class="container split"><div><h2>Village Limits</h2><p>${esc(c.settings.address)}</p><p><strong>Telephone:</strong> ${esc(c.settings.telephone)}<br><strong>Email:</strong> ${esc(c.settings.email)}</p></div><img src="/assets/images/exterior.webp" alt="Village Limits in Woodhall Spa"></div></section>`)}

function afternoonTeaPage(sent=false,error=""){
  const note=sent
    ?`<div class="enquiry-success"><h2>Thank you</h2><p>Your Afternoon Tea enquiry has been sent to our events team.</p></div>`
    :error
      ?`<div class="enquiry-error">${esc(error)}</div>`
      :"";

  return shell(
    "Afternoon Tea Woodhall Spa | Village Limits",
    "Enjoy Afternoon Tea in Woodhall Spa at Village Limits from &pound;27.50 per person, with G&T, Prosecco and Champagne options. Enquire online.",
    "/afternoon-tea",
    `
    <section class="tea-hero">
      <div class="container tea-hero-copy">
        <div class="eyebrow">Afternoon Tea in Woodhall Spa</div>
        <h1>Afternoon Tea<br>at Village Limits</h1>
        <p>Handmade savouries, freshly prepared sandwiches, indulgent sweet treats and traditional British scones.</p>
        <div class="tea-price">From &pound;27.50 per person</div>
        <a class="btn large" href="#tea-enquiry">Enquire now</a>
      </div>
    </section>

    <section class="section tea-intro">
      <div class="container split">
        <div>
          <div class="eyebrow">A little time well spent</div>
          <h2>Made for sharing</h2>
          <p class="lead">Join us for a generous Afternoon Tea in Woodhall Spa, whether you are celebrating a birthday, gathering with friends or simply treating yourselves.</p>
        </div>
        <img class="tea-feature-image" src="/assets/images/afternoon-tea/afternoon-tea-scones-eton-mess.jpg" alt="Afternoon Tea with homemade scones, cakes and Eton mess at Village Limits Woodhall Spa">
      </div>
    </section>

    <section class="section tea-menu-section">
      <div class="container">
        <div class="tea-menu-head">
          <div class="eyebrow">The Menu</div>
          <h2>Village Limits Afternoon Tea</h2>
          <div class="tea-main-price">&pound;27.50 per person</div>
        </div>

        <div class="tea-menu-grid">
          <div class="tea-course">
            <h2>Savouries</h2>
            <p>No Limits sausage rolls</p>
            <p>Limits Scotch egg</p>
            <p>Caramelised onion, feta &amp; spinach quiche</p>
          </div>

          <div class="tea-course">
            <h2>Sandwiches</h2>
            <p>Smoked salmon, cream cheese, dill &amp; lemon on malted bread</p>
            <p>Tuna mayonnaise &amp; cucumber on white bloomer</p>
            <p>Free-range egg mayonnaise &amp; British watercress on white bloomer</p>
            <p>Home-cooked ham &amp; English mustard on malted bread</p>
          </div>

          <div class="tea-course">
            <h2>Pastries &amp; Cakes</h2>
            <p>Passion fruit, white chocolate &amp; vanilla cheesecake</p>
            <p>Mini Eton mess with summer strawberries, coulis &amp; meringue</p>
            <p>British scones with Cornish clotted cream &amp; strawberry preserve</p>
          </div>
        </div>
      </div>
    </section>

    <section class="section tea-packages">
      <div class="container">
        <div class="tea-menu-head">
          <div class="eyebrow">Make it a celebration</div>
          <h2>Choose your Afternoon Tea</h2>
        </div>

        <div class="tea-package-grid">
          <div><h3>Classic</h3><strong>&pound;27.50</strong></div>
          <div><h3>G&amp;T</h3><strong>&pound;33.50</strong><small>125ml equivalent serve</small></div>
          <div><h3>Prosecco</h3><strong>&pound;33.50</strong><small>125ml glass</small></div>
          <div><h3>Champagne</h3><strong>&pound;39.50</strong><small>125ml glass</small></div>
        </div>
      </div>
    </section>

    <section class="section tea-premium">
      <div class="container split">
        <img class="tea-feature-image" src="/assets/images/afternoon-tea/afternoon-tea-canapes-table.jpg" alt="Afternoon Tea savouries and canap&eacute;s at Village Limits">
        <div>
          <div class="eyebrow">For parties of 8 or more</div>
          <h2>Premium Canap&eacute; Selection</h2>
          <div class="tea-main-price">+&pound;6 per person</div>
          <p>Smoked salmon blini</p>
          <p>Devilled eggs</p>
          <p>Beetroot hummus &amp; cracker</p>
          <p>Butterflied king prawns</p>
        </div>
      </div>
    </section>

    <section class="section tea-gallery">
      <div class="container">
        <div class="tea-gallery-grid">
          <img src="/assets/images/afternoon-tea/afternoon-tea-tiered-cakes.jpg" alt="Tiered Afternoon Tea cakes at Village Limits">
          <img src="/assets/images/afternoon-tea/afternoon-tea-savouries-table.jpg" alt="Afternoon Tea savouries at Village Limits">
          <img src="/assets/images/afternoon-tea/afternoon-tea-party-table.jpg" alt="Afternoon Tea celebration at Village Limits">
        </div>
      </div>
    </section>

    <section id="tea-enquiry" class="section tea-enquiry">
      <div class="container split">
        <div>
          <div class="eyebrow">Plan your Afternoon Tea</div>
          <h2>Make an enquiry</h2>
          <p class="lead">Tell us when you would like to visit and our events team will contact you to confirm availability.</p>
        </div>

        <div class="christmas-enquiry-card">
          ${note}
          <form method="post" action="/afternoon-tea/enquire">
            <label>Name<input name="name" required></label>
            <label>Email<input name="email" type="email" required></label>
            <label>Phone number<input name="phone" type="tel" required></label>

            <div class="row-2">
              <label>Preferred date<input name="preferredDate" type="date" required></label>
              <label>Preferred time<input name="preferredTime" type="time" required></label>
            </div>

            <label>Number in party<input name="partySize" type="number" min="2" max="100" required></label>

            <label>Afternoon Tea package
              <select name="packageName" required>
                <option value="Classic Afternoon Tea - &pound;27.50">Classic Afternoon Tea &mdash; &pound;27.50</option>
                <option value="G&T Afternoon Tea - &pound;33.50">G&amp;T Afternoon Tea &mdash; &pound;33.50</option>
                <option value="Prosecco Afternoon Tea - &pound;33.50">Prosecco Afternoon Tea &mdash; &pound;33.50</option>
                <option value="Champagne Afternoon Tea - &pound;39.50">Champagne Afternoon Tea &mdash; &pound;39.50</option>
              </select>
            </label>

            <label class="tea-check">
              <input type="checkbox" name="canapes" value="yes">
              Add Premium Canap&eacute; Selection (+&pound;6 pp, parties of 8+)
            </label>

            <label>Dietary requirements / allergens<textarea name="dietary" rows="3"></textarea></label>
            <label>Additional information<textarea name="message" rows="4"></textarea></label>

            <button class="btn large" type="submit">Send Afternoon Tea Enquiry</button>
          </form>
        </div>
      </div>
    </section>
    `,
    "index,follow",
    "/assets/images/afternoon-tea/afternoon-tea-scones-eton-mess.jpg"
  );
}

async function afternoonTeaEnquiry(req){
  const raw=await new Promise((resolve,reject)=>{
    let b="";
    req.on("data",x=>{
      b+=x;
      if(b.length>250000){
        reject(new Error("Enquiry is too large."));
        req.destroy();
      }
    });
    req.on("end",()=>resolve(b));
    req.on("error",reject);
  });

  const q=Object.fromEntries(new URLSearchParams(raw));

  const name=String(q.name||"").trim();
  const email=String(q.email||"").trim();
  const phone=String(q.phone||"").trim();
  const preferredDate=String(q.preferredDate||"").trim();
  const preferredTime=String(q.preferredTime||"").trim();
  const partySize=Number(q.partySize);
  const packageName=String(q.packageName||"").trim();
  const dietary=String(q.dietary||"").trim();
  const message=String(q.message||"").trim();
  const canapes=q.canapes==="yes";

  if(!name||!email||!phone||!preferredDate||!preferredTime||!Number.isInteger(partySize)||partySize<2||!packageName){
    throw new Error("Please complete all required fields.");
  }

  if(canapes&&partySize<8){
    throw new Error("The Premium Canap&eacute; Selection is available for parties of 8 or more.");
  }

  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
    throw new Error("Please enter a valid email address.");
  }

  await sendAfternoonTeaEnquiry({
    name,email,phone,preferredDate,preferredTime,partySize,packageName,dietary,message,canapes
  });

  return {ok:true};
}

function christmasPage(sent=false,error=""){
 const starters=[["Winter carrot & ginger soup","Pumpkin seed, toasted sourdough"],["Taste of the sea","Hot smoked salmon, smoked mackerel, prawns in Marie Rose sauce, lumpfish caviar, horseradish and artisan crackers"],["Chicken liver parfait","Caramelised onions, cranberry chutney, mixed leaf salad and toasted sourdough"],["Baked camembert","Filo pastry, hot truffle honey, candied cashews and toasted sourdough (+Ã‚&pound;2.50 per portion)"],["Sweetcorn ribs","Cajun seasoning, chipotle mayo and lime"],["Pan-fried Argentinian shrimp","CafÃƒ© de Paris butter and grilled artisan flatbread"],["Chestnut & wild mushrooms","Garlic and herb butter on toasted sourdough"]];
 const mains=[["Braised beef short rib","Creamed mash, green beans in confit shallot and red wine jus"],["Turkey schnitzel","Honey-glazed pigs in blankets, cranberry, chips and gravy"],["Flat iron steak","Dauphinoise potato, green beans in confit shallots and peppercorn sauce"],["Pan-seared pork chop","Celeriac purÃƒ©e, braised red cabbage, tenderstem broccoli, cider and sage jus"],["Village Limits festive pie","Turkey, stuffing and cranberry pie, creamed mash and seasonal vegetables"],["Baked heritage carrots","Beetroot hummus, braised lentils, kale pesto and toasted seeds"],["Pan-roasted halibut","Samphire, shrimp, artichoke and lemon butter herb sauce"]];
 const desserts=[["Steamed Christmas sponge","Brandy cream"],["Winter berry pavlova","Candied pistachios, maple and crÃƒ¨me Chantilly"],["Orange, lemon & ginger posset","Strawberries and homemade shortbread"],["Triple chocolate brownie","Chocolate ice cream and chocolate sauce"],["Cheese board","Black Bomber cheddar, Shropshire Blue and Lincolnshire Poacher, figs, grapes and artisan crackers"],["Plum & cinnamon crÃƒ¨me brÃƒ»lÃƒ©e","Shortbread"],["Spiced apple & cranberry crumble","Custard"]];
 const items=a=>a.map(([n,d])=>`<article class="christmas-dish"><h3>${esc(n)}</h3><p>${esc(d)}</p></article>`).join("");
 const note=sent?`<div class="enquiry-success"><h2>Thank you</h2><p>Your enquiry has been sent to our events team.</p></div>`:error?`<div class="enquiry-error">${esc(error)}</div>`:"";
 const seoSchema={
   "@context":"https://schema.org",
   "@type":["Restaurant","LocalBusiness"],
   "name":"Village Limits",
   "url":SITE+"/christmas",
   "image":SITE+"/assets/images/christmas-festive-hero.jpg",
   "telephone":"01526 353525",
   "email":"events@villagelimits.co.uk",
   "servesCuisine":["British","Modern British"],
   "priceRange":"Ã‚&pound;Ã‚&pound;",
   "address":{
     "@type":"PostalAddress",
     "streetAddress":"Village Limits",
     "addressLocality":"Woodhall Spa",
     "addressRegion":"Lincolnshire",
     "postalCode":"LN10 6QH",
     "addressCountry":"GB"
   },
   "areaServed":["Woodhall Spa","Lincolnshire"],
   "description":"Christmas parties, festive dining and Christmas party menus at Village Limits in Woodhall Spa, Lincolnshire."
 };
 return shell(
   "Christmas Parties Woodhall Spa | Christmas Party Menu | Village Limits",
   "Book your Christmas party in Woodhall Spa at Village Limits. Festive dining, Christmas party menu, group celebrations and enquiries for parties across Lincolnshire.",
   "/christmas",
   `<section class="christmas-hero"><div class="container christmas-hero-copy"><div class="eyebrow">Christmas Parties in Woodhall Spa</div><h1>Christmas Party Menu</h1><p>Celebrate Christmas at Village Limits in Woodhall Spa, Lincolnshire Ã¢â‚¬&rdquo; perfect for staff parties, family gatherings and festive get-togethers.</p><div class="christmas-price">Ã‚&pound;35 per person</div><a class="btn large" href="#christmas-enquiry">Enquire now</a></div></section>
   <section class="section christmas-seo-intro"><div class="container narrow"><div class="eyebrow">Christmas at Village Limits</div><h2>Christmas parties and festive dining in Woodhall Spa</h2><p class="lead">Planning a Christmas meal, office Christmas party or festive celebration in Lincolnshire? Village Limits offers a relaxed Christmas party venue in Woodhall Spa with a three-course festive menu, warm hospitality and easy online enquiry.</p><p>Whether you are organising a work Christmas party, a family celebration or a festive meal with friends, our team can help you plan your preferred date and party size.</p></div></section>
   <section class="section christmas-menu-section"><div class="container"><div class="christmas-menu-grid"><section class="christmas-course"><h2>Starters</h2>${items(starters)}</section><section class="christmas-course"><h2>Mains</h2>${items(mains)}</section><section class="christmas-course christmas-desserts"><h2>Desserts</h2>${items(desserts)}</section></div></div></section>
   <section id="christmas-enquiry" class="section christmas-enquiry-section"><div class="container split"><div><div class="eyebrow">Plan your celebration</div><h2>Christmas party enquiry</h2><p class="lead">Tell us your preferred date and party size and our events team will contact you.</p><p>Christmas party enquiries are sent directly to <strong>events@villagelimits.co.uk</strong>.</p></div><div class="christmas-enquiry-card">${note}<form method="post" action="/christmas/enquire"><div class="honeypot"><input name="website" tabindex="-1" autocomplete="off"></div><label>Name<input name="name" required></label><label>Email<input name="email" type="email" required></label><label>Phone number<input name="phone" type="tel" required></label><div class="row-2"><label>Preferred date<input name="preferredDate" type="date" required></label><label>Number in party<input name="partySize" type="number" min="2" max="250" required></label></div><label>Additional information<textarea name="message" rows="4"></textarea></label><button class="btn large" type="submit">Send Christmas Enquiry</button></form></div></div></section>`,
   "index,follow",
   "/assets/images/christmas-festive-hero.jpg",
   seoSchema
 )
}
async function christmasEnquiry(req){
  const raw=await new Promise((resolve,reject)=>{
    let b="";
    req.on("data",c=>{b+=c;if(b.length>250000){reject(new Error("Enquiry is too large."));req.destroy()}});
    req.on("end",()=>resolve(b));
    req.on("error",reject);
  });

  const ct=String(req.headers["content-type"]||"");
  let q={};

  if(ct.includes("application/x-www-form-urlencoded")){
    q=Object.fromEntries(new URLSearchParams(raw));
  }else if(ct.includes("application/json")){
    try{q=raw?JSON.parse(raw):{}}catch{throw new Error("Invalid enquiry data.");}
  }else{
    q=Object.fromEntries(new URLSearchParams(raw));
  }

  

  const name=String(q.name||"").trim();
  const email=String(q.email||"").trim();
  const phone=String(q.phone||"").trim();
  const preferredDate=String(q.preferredDate||"").trim();
  const partySize=Number(q.partySize);
  const message=String(q.message||"").trim();

  if(!name||!email||!phone||!preferredDate||!Number.isInteger(partySize)||partySize<2||partySize>250){
    throw new Error("Please complete all required fields.");
  }
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
    throw new Error("Please enter a valid email address.");
  }

  await sendChristmasEnquiry({name,email,phone,preferredDate,partySize,message});
  console.log("Christmas enquiry sent successfully",{
    name,email,preferredDate,partySize,recipient:EVENT_ENQUIRY_TO
  });

  return {ok:true};
}
function privateEvents(){return shell("Private Events & Celebrations | Village Limits Woodhall Spa","Plan private dining, celebrations and special occasions at Village Limits in Woodhall Spa.","/private-events",`${ph("Celebrations","Private Events","Parties, celebrations and special occasions.")}<section class="section"><div class="container split"><div><h2>Create an occasion to remember</h2><p class="lead">Contact us to discuss private dining, celebrations and group events.</p><a class="btn" href="/contact">Contact Us</a></div><img src="/assets/images/courtyard.webp" alt="Private events at Village Limits"></div></section>`)}
function robots(){return `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/admin/\nSitemap: ${SITE}/sitemap.xml\n`}
function sitemap(){const c=read(),ps=["/","/eat","/stay","/whats-on","/christmas","/private-events","/contact","/book-table",...c.menus.filter(m=>m.visible).map(m=>`/menu/${encodeURIComponent(m.id)}`),...c.events.filter(e=>e.visible).map(e=>`/event/${encodeURIComponent(e.id)}`)];return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${ps.map(p=>`<url><loc>${SITE}${p}</loc></url>`).join("")}</urlset>`}
function uploadFile(p,res){
  const name=path.basename(String(p||"")),f=path.join(UPLOADS_DIR,name);
  fs.stat(f,(e,st)=>{if(e||!st.isFile()){res.writeHead(404);return res.end("Not found")}
    fs.readFile(f,(x,d)=>{res.writeHead(x?500:200,{"Content-Type":mime[path.extname(f).toLowerCase()]||"application/octet-stream","Cache-Control":"public, max-age=86400"});res.end(x?"Error":d)})
  })
}
function staticFile(p,res){const f=path.normalize(path.join(ROOT,p));if(!f.startsWith(ROOT)){res.writeHead(403);return res.end("Forbidden")}fs.stat(f,(e,s)=>{if(e||!s.isFile()){res.writeHead(404);return res.end("Not found")}fs.readFile(f,(x,d)=>{res.writeHead(x?500:200,{"Content-Type":mime[path.extname(f)]||"application/octet-stream","Cache-Control":path.extname(f)===".html"?"no-store":"public, max-age=3600"});res.end(x?"Error":d)})})}
seedMainMenu();
migrateEventSeo();
http.createServer(async(req,res)=>{try{const u=new URL(req.url,`http://${req.headers.host||"localhost"}`),p=decodeURIComponent(u.pathname);
if(canonicalRedirect(req,res,u))return;
if(p==="/robots.txt"){res.writeHead(200,{"Content-Type":"text/plain; charset=utf-8"});return res.end(robots())} if(p==="/sitemap.xml"){res.writeHead(200,{"Content-Type":"application/xml; charset=utf-8"});return res.end(sitemap())}
if(p==="/api/version")return json(res,200,{version:VERSION,build:BUILD,label:"SEO & Admin Reliability"}); if(p==="/api/content"&&req.method==="GET")return json(res,200,read()); if(p==="/api/admin/status")return json(res,200,{authenticated:valid(req)});
if(p==="/api/admin/login"&&req.method==="POST"){const b=await body(req),u1=String(b.username??"").trim(),p1=String(b.password??"");if(u1!==USER||p1!==PASS)return json(res,401,{error:"Incorrect username or password"});const t=make();res.writeHead(200,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","Set-Cookie":`vl_admin=${encodeURIComponent(t)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=28800`});return res.end(JSON.stringify({ok:true,token:t}))}
if(p==="/api/admin/logout"&&req.method==="POST"){res.writeHead(200,{"Content-Type":"application/json; charset=utf-8","Set-Cookie":"vl_admin=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0"});return res.end('{"ok":true}')}
if(p==="/api/admin/content"&&req.method==="GET"){if(!valid(req))return json(res,401,{error:"Your admin session is not authorised. Please sign in again."});return json(res,200,read())}
if(p==="/api/admin/test-email"&&req.method==="POST"){
    if(!valid(req))return json(res,401,{error:"Your admin session has expired. Please sign in again."});
    try{
      await sendTestEmail();
      return json(res,200,{ok:true,message:"Test email sent successfully."});
    }catch(e){
      return json(res,500,{ok:false,error:e.message});
    }
  }
  if(p==="/api/admin/content"&&req.method==="PUT"){if(!valid(req))return json(res,401,{error:"Your admin session has expired. Please sign in again."});write(await body(req));return json(res,200,{ok:true})}
if(p==="/api/admin/upload-image"&&req.method==="POST"){if(!valid(req))return json(res,401,{error:"Your admin session has expired. Please sign in again."});const payload=await largeBody(req);const url=saveUploadedImage(payload);return json(res,200,{ok:true,url})}
if(p.startsWith("/uploads/"))return uploadFile(p.slice(9),res); if(p==="/")return html(res,home()); if(p==="/eat")return html(res,eat()); if(p.startsWith("/menu/"))return html(res,menu(p.slice(6))); if(p==="/stay")return html(res,stay()); if(p==="/whats-on")return html(res,events());if(p==="/api/christmas-email-health"&&req.method==="GET")return json(res,200,{configured:Boolean(MS_TENANT_ID&&MS_CLIENT_ID&&MS_CLIENT_SECRET),sender:EVENT_SENDER,recipient:EVENT_ENQUIRY_TO,tenant:Boolean(MS_TENANT_ID),client:Boolean(MS_CLIENT_ID),secret:Boolean(MS_CLIENT_SECRET)});if(p==="/afternoon-tea"&&req.method==="GET")return html(res,afternoonTeaPage(new URL(req.url,"http://localhost").searchParams.get("sent")==="1"));
if(p==="\/christmas"&&req.method==="GET")return html(res,christmasPage(new URL(req.url,"http://localhost").searchParams.get("sent")==="1"));if(p==="/afternoon-tea/enquire"&&req.method==="POST"){try{await afternoonTeaEnquiry(req);res.writeHead(303,{"Location":"/afternoon-tea?sent=1#tea-enquiry"});return res.end()}catch(e){console.error("Afternoon Tea enquiry failed",e);return html(res,afternoonTeaPage(false,e.message),400)}}
if(p==="\/christmas\/enquire"&&req.method==="POST"){
  try{
    await christmasEnquiry(req);
    res.writeHead(303,{"Location":"/christmas?sent=1#christmas-enquiry"});
    return res.end();
  }catch(e){
    console.error("Christmas enquiry submission failed:",e);
    return html(res,christmasPage(false,e.message),400);
  }
} if(p.startsWith("/event/"))return html(res,eventDetail(p.slice(7))); if(p==="/book-table")return html(res,book()); if(p==="/contact")return html(res,contact()); if(p==="/private-events")return html(res,privateEvents()); if(p==="/admin"&&req.method==="GET"){if(valid(req))return staticFile("/admin.html",res);return html(res,loginPage(u.searchParams.get("error")==="1"))}
if(p==="/admin/login"&&req.method==="POST"){const b=await formBody(req);const suppliedUser=String(b.username??"").trim(),suppliedPass=String(b.password??"");if(suppliedUser!==USER||suppliedPass!==PASS){res.writeHead(303,{"Location":"/admin?error=1","Cache-Control":"no-store"});return res.end()}const t=make();res.writeHead(303,{"Location":"/admin","Cache-Control":"no-store","Set-Cookie":`vl_admin=${encodeURIComponent(t)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=28800`});return res.end()}
if(p==="/admin/logout"&&req.method==="POST"){res.writeHead(303,{"Location":"/admin","Cache-Control":"no-store","Set-Cookie":"vl_admin=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0"});return res.end()}
if(p==="/admin.html"){res.writeHead(302,{"Location":"/admin","Cache-Control":"no-store"});return res.end()} return staticFile(p,res)
}catch(e){console.error(e);json(res,500,{error:e.message})}}).listen(PORT,()=>console.log(`Village Limits Version ${VERSION} running on ${PORT}`));
