const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 8080;
const ROOT = path.join(__dirname, 'public');
const CONTENT_PATH = path.join(__dirname, 'data', 'content.json');
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'ChangeMe-Immediately';
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-this-session-secret';
const BUILD_SHA = process.env.GITHUB_SHA ? process.env.GITHUB_SHA.slice(0, 7) : 'local';

const mime = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml'};
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const content = () => JSON.parse(fs.readFileSync(CONTENT_PATH, 'utf8'));
const json = (res, code, body) => { res.writeHead(code, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}); res.end(JSON.stringify(body)); };

function sign(value){ return crypto.createHmac('sha256', SESSION_SECRET).update(value).digest('hex'); }
function makeToken(){ const raw = `${ADMIN_USERNAME}|${Date.now()+8*60*60*1000}`; return `${Buffer.from(raw).toString('base64url')}.${sign(raw)}`; }
function isLoggedIn(req){
  const cookie = (req.headers.cookie || '').split(';').map(x=>x.trim()).find(x=>x.startsWith('vl_admin='));
  if(!cookie) return false;
  const token = decodeURIComponent(cookie.slice(9));
  const [encoded, sig] = token.split('.');
  if(!encoded || !sig) return false;
  let raw; try { raw = Buffer.from(encoded,'base64url').toString(); } catch { return false; }
  const expected = sign(raw);
  if(sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected))) return false;
  const [user, expiry] = raw.split('|');
  return user === ADMIN_USERNAME && Number(expiry) > Date.now();
}
function readBody(req){ return new Promise((resolve,reject)=>{ let body=''; req.on('data',c=>body+=c); req.on('end',()=>{try{resolve(JSON.parse(body||'{}'))}catch(e){reject(e)}}); req.on('error',reject); }); }

function header(){ return `<header class="site-header"><div class="container nav"><a class="brand" href="/"><img src="/assets/images/logo-white.png" alt="Village Limits"></a><button class="menu-toggle" aria-label="Open menu">☰</button><nav class="navlinks"><a href="/eat">Eat</a><a href="/stay">Stay</a><a href="/whats-on">What's On</a><a href="/private-events">Private Events</a><a href="/contact">Contact</a><a href="/book-table">Book a Table</a></nav><a class="btn" href="/book-table">Book</a></div></header>`; }
function footer(c){ return `<footer class="footer"><div class="container footer-grid"><div><img src="/assets/images/logo-white.png" alt="Village Limits"><p>A warm welcome, memorable dining, comfortable rooms and entertaining evenings in Woodhall Spa.</p></div><div><div class="eyebrow">Contact</div><p>${esc(c.settings.telephone)}<br>${esc(c.settings.email)}</p></div><div><div class="eyebrow">Opening</div><p>${esc(c.settings.openingHours)}</p></div></div><div class="container footer-bottom"><small>Village Limits Platform · Version ${esc(c.version)} · Build ${BUILD_SHA}</small></div></footer>`; }
function shell(title, body, options={}){ const c=content(); return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} | Village Limits</title><link rel="stylesheet" href="/assets/css/styles.css"></head><body>${header()}${body}${footer(c)}<script src="/assets/js/site.js"></script></body></html>`; }
function hero(eyebrow, heading, intro){ return `<section class="page-hero"><div class="container"><div class="eyebrow">${esc(eyebrow)}</div><h1>${esc(heading)}</h1><p>${esc(intro)}</p></div></section>`; }
function renderHome(){ return shell('Home', `<section class="home-hero"><div class="shade"></div><div class="container hero-copy"><img src="/assets/images/logo-white.png" alt="Village Limits"><p>Boutique accommodation, memorable dining and entertaining evenings in Woodhall Spa.</p><div class="actions"><a class="btn" href="/book-table">Book a Table</a><a class="btn outline-light" href="/stay">Book a Stay</a></div></div></section><section class="section"><div class="container split"><div><div class="eyebrow">Welcome</div><h2>Good food, comfortable rooms and memorable evenings</h2><p class="lead">Discover Village Limits in Woodhall Spa.</p><div class="actions"><a class="btn" href="/eat">View Menus</a><a class="btn outline" href="/whats-on">What's On</a></div></div><img src="/assets/images/interior.webp" alt="Village Limits interior"></div></section>`); }
function renderEat(){ const c=content(); const cards=c.menus.filter(m=>m.visible).map(m=>`<a class="menu-card" href="/menu/${encodeURIComponent(m.id)}"><div class="eyebrow">${esc(m.status)}</div><h2>${esc(m.name)}</h2><p>${esc(m.description)}</p><span class="btn">Open ${esc(m.name)}</span></a>`).join(''); return shell('Menus', `${hero('Restaurant','Our menus','Every menu shown below is included in Version 1.')}<section class="section"><div class="container menu-grid">${cards}</div></section>`); }
function renderMenu(id){ const c=content(); const m=c.menus.find(x=>x.id===id && x.visible); if(!m) return shell('Menu unavailable', `${hero('Menus','Menu unavailable','This menu is currently hidden.')}<section class="section"><div class="container"><a class="btn" href="/eat">Back to menus</a></div></section>`); const sections=m.sections.map(s=>`<section class="menu-section"><div class="eyebrow">${esc(s.name)}</div><h2>${esc(s.name)}</h2>${s.items.map(i=>`<article class="dish"><div class="dish-row"><h3>${esc(i.name)}</h3><strong>${esc(i.price)}</strong></div>${i.description?`<p>${esc(i.description)}</p>`:''}${i.allergens?`<small>Allergens: ${esc(i.allergens)}</small>`:''}</article>`).join('')}</section>`).join(''); return shell(m.name, `${hero('Menu',m.name,m.description)}<section class="section"><div class="container narrow"><div class="status-note">${esc(m.status)}</div>${sections}<a class="back-link" href="/eat">← Back to all menus</a></div></section>`); }
function renderStay(){ const url='https://direct-book.com/properties/VillageLimitsMotelDirect?locale=en&items[0][adults]=2&items[0][children]=0&items[0][infants]=0&currency=GBP&trackPage=yes'; return shell('Stay', `${hero('Accommodation','Stay at Village Limits','Comfortable, air-conditioned rooms in Woodhall Spa.')}<section class="section"><div class="container split"><img src="/assets/images/rooms.webp" alt="Village Limits room"><div><div class="eyebrow">Direct booking</div><h2>Check availability and book your stay</h2><p class="lead">Use our secure accommodation booking site to select your dates and room.</p><a class="btn large" target="_blank" rel="noopener" href="${url}">Check Availability & Book</a></div></div></section>`); }
function renderWhatsOn(){ const c=content(); return shell("What's On", `${hero('Entertainment',"What's On",'Dinner, live music and special evenings.')}<section class="section"><div class="container event-grid">${c.events.map(e=>`<article class="event-card"><div class="eyebrow">${esc(e.date)}</div><h2>${esc(e.title)}</h2><p>${esc(e.description)}</p><a class="btn" target="_blank" rel="noopener" href="${esc(e.ticketUrl)}">Buy Tickets</a></article>`).join('')}</div></section>`); }
function renderBookTable(){ return shell('Book a Table', `${hero('Restaurant','Book a Table','Reserve your table using our secure booking system.')}<section class="section"><div class="container booking-box"><script src="https://touchreservation.net/customer/javascript/embed.js?coalias=villagelimits&site=1" type="text/javascript"></script><noscript>Please enable JavaScript to use the booking form.</noscript></div></section>`); }
function renderContact(){ const c=content(); return shell('Contact', `${hero('Contact','Get in touch','We look forward to welcoming you.')}<section class="section"><div class="container contact-grid"><div><h2>Village Limits</h2><p>${esc(c.settings.address)}</p><p><strong>Telephone:</strong> ${esc(c.settings.telephone)}<br><strong>Email:</strong> ${esc(c.settings.email)}</p></div><img src="/assets/images/exterior.webp" alt="Village Limits exterior"></div></section>`); }
function renderPrivateEvents(){ return shell('Private Events', `${hero('Celebrations','Private Events','Parties, celebrations and special occasions.')}<section class="section"><div class="container split"><div><h2>Create an occasion to remember</h2><p class="lead">Contact us to discuss private dining, celebrations and group events.</p><a class="btn" href="/contact">Contact Us</a></div><img src="/assets/images/courtyard.webp" alt="Village Limits courtyard"></div></section>`); }
function renderAdmin(loggedIn, error=''){ const c=content(); if(!loggedIn) return shell('Website Administration', `<main class="admin-wrap"><section class="login-card"><img src="/assets/images/logo-gold.png" alt="Village Limits"><h1>Website administration</h1><p>Sign in to view exactly what is included in the current deployment.</p>${error?`<div class="error">${esc(error)}</div>`:''}<form method="post" action="/admin/login"><label>Username<input name="username" required autocomplete="username"></label><label>Password<input name="password" type="password" required autocomplete="current-password"></label><button class="btn" type="submit">Sign In</button></form></section></main>`); const rows=c.menus.map(m=>`<tr><td>${esc(m.name)}</td><td>${m.visible?'Visible':'Hidden'}</td><td>${m.sections.reduce((n,s)=>n+s.items.length,0)}</td><td>${esc(m.status)}</td></tr>`).join(''); return shell('Admin Dashboard', `<main class="admin-dashboard"><div class="container"><div class="admin-top"><div><div class="eyebrow">Current deployment</div><h1>Version ${esc(c.version)}</h1><p>Build ${BUILD_SHA} · ${esc(c.buildLabel)}</p></div><form method="post" action="/admin/logout"><button class="btn outline" type="submit">Log Out</button></form></div><div class="admin-panel"><h2>Menus uploaded in this version</h2><table><thead><tr><th>Menu</th><th>Public</th><th>Items</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div><div class="admin-panel"><h2>Public checks</h2><p><a href="/eat">Open menu directory</a> · <a href="/api/version">Open version JSON</a> · <a href="/api/content">Open content JSON</a></p></div></div></main>`); }

http.createServer(async (req,res)=>{
  try{
    const u=new URL(req.url,`http://${req.headers.host||'localhost'}`); const p=decodeURIComponent(u.pathname);
    if(p==='/api/version') return json(res,200,{version:content().version,build:BUILD_SHA,label:content().buildLabel});
    if(p==='/api/content') return json(res,200,content());
    if(p==='/admin/login' && req.method==='POST'){ const b=await readBody(req); if(b.username===ADMIN_USERNAME && b.password===ADMIN_PASSWORD){ const t=makeToken(); res.writeHead(302,{'Set-Cookie':`vl_admin=${encodeURIComponent(t)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=28800`,'Location':'/admin'}); return res.end(); } res.writeHead(401,{'Content-Type':'text/html; charset=utf-8'}); return res.end(renderAdmin(false,'Incorrect username or password.')); }
    if(p==='/admin/logout' && req.method==='POST'){ res.writeHead(302,{'Set-Cookie':'vl_admin=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0','Location':'/admin'}); return res.end(); }
    if(p==='/admin') { res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}); return res.end(renderAdmin(isLoggedIn(req))); }
    if(p==='/') return html(res,renderHome());
    if(p==='/eat') return html(res,renderEat());
    if(p.startsWith('/menu/')) return html(res,renderMenu(p.slice(6)));
    if(p==='/stay') return html(res,renderStay());
    if(p==='/whats-on') return html(res,renderWhatsOn());
    if(p==='/book-table') return html(res,renderBookTable());
    if(p==='/contact') return html(res,renderContact());
    if(p==='/private-events') return html(res,renderPrivateEvents());
    const file=path.normalize(path.join(ROOT,p)); if(!file.startsWith(ROOT)) {res.writeHead(403);return res.end('Forbidden');}
    fs.stat(file,(err,st)=>{ if(err||!st.isFile()){res.writeHead(404);return res.end('Not found');} fs.readFile(file,(e,d)=>{if(e){res.writeHead(500);return res.end('Error');} res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(d);});});
  }catch(e){json(res,500,{error:e.message});}
}).listen(PORT,()=>console.log(`Village Limits Version 1 running on ${PORT}`));
function html(res,body){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(body);}
