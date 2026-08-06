const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, 'public');
const port = process.env.PORT || 8080;
const dataDir = process.env.CONTENT_DATA_DIR || (process.env.HOME ? path.join(process.env.HOME, 'site', 'data') : path.join(__dirname, 'data'));
const dataFile = path.join(dataDir, 'content.json');
const adminUser = process.env.ADMIN_USERNAME || 'admin';
const adminPassword = process.env.ADMIN_PASSWORD || 'ChangeMe-Immediately';
const sessionSecret = process.env.SESSION_SECRET || 'change-this-session-secret';

const mime = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};

const defaultContent = {
  settings: {
    openingHours: 'Wednesday–Saturday from 6pm · Sunday 12–4pm',
    telephone: '01526 353312',
    email: 'hello@villagelimits.co.uk',
    address: 'Village Limits, Woodhall Spa, Lincolnshire',
    homepageNotice: ''
  },
  menus: [
    { id: 'main', name: 'Main Menu', description: 'Seasonal dishes and Village Limits favourites.', active: true, dishes: [
      { id: crypto.randomUUID(), section: 'Starters', name: 'Homemade soup of the day', description: 'Served with toasted sourdough.', price: '£8', allergens: 'Gluten, celery', active: true },
      { id: crypto.randomUUID(), section: 'Starters', name: 'Garlic & rosemary focaccia', description: 'Truffle and cauliflower hummus, roasted hazelnuts and crispy onions.', price: '£8.50', allergens: 'Nuts, gluten, sesame', active: true },
      { id: crypto.randomUUID(), section: 'Starters', name: 'Pan-fried chestnut mushrooms', description: 'Garlic and herb vegan butter, toasted sourdough.', price: '£8.50', allergens: 'Gluten, soya', active: true },
      { id: crypto.randomUUID(), section: 'Starters', name: 'Pulled beef rib bonbons', description: 'Burnt cider apple sauce and truffle aioli.', price: '£8.50', allergens: 'Gluten, egg, milk, celery, sulphites, mustard', active: true }
    ]},
    { id: 'sunday', name: 'Sunday Lunch', description: 'Traditional favourites and seasonal accompaniments.', active: true, dishes: [] },
    { id: 'specials', name: 'Specials', description: 'Our latest seasonal and limited-availability dishes.', active: true, dishes: [] },
    { id: 'desserts', name: 'Desserts', description: 'Finish with something special.', active: true, dishes: [] },
    { id: 'childrens', name: "Children's Menu", description: 'Smaller portions and family favourites.', active: true, dishes: [] }
  ],
  events: [
    { id: crypto.randomUUID(), title: 'Sarah-Jane Jazz', date: '2026-09-04', displayDate: 'Friday 4 September', time: '', price: '', description: 'A three-course meal with music from the 1920s to the present day. Limited availability.', image: '/assets/images/event.webp', ticketUrl: 'https://villagelimits.touchtakeaway.net/menu', status: 'limited', featured: true },
    { id: crypto.randomUUID(), title: 'Psychic evening', date: '2026-11-30', displayDate: 'Monday 30 November 2026 · 6:30pm', time: '18:30', price: '£30 per person', description: 'Two-course meal with MediumJoe.', image: '/assets/images/interior.webp', ticketUrl: 'https://villagelimits.touchtakeaway.net/menu', status: 'available', featured: true }
  ]
};

function ensureData() {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dataFile)) fs.writeFileSync(dataFile, JSON.stringify(defaultContent, null, 2));
}
function normaliseContent(content) {
  content = content && typeof content === 'object' ? content : {};
  content.settings = content.settings || {};
  content.events = Array.isArray(content.events) ? content.events : [];
  content.menus = Array.isArray(content.menus) ? content.menus : [];
  const requiredMenus = [
    { id: 'main', name: 'Main Menu', description: 'Seasonal dishes and Village Limits favourites.' },
    { id: 'sunday', name: 'Sunday Lunch', description: 'Traditional favourites and seasonal accompaniments.' },
    { id: 'specials', name: 'Specials', description: 'Our latest seasonal and limited-availability dishes.' },
    { id: 'desserts', name: 'Desserts', description: 'Finish with something special.' },
    { id: 'childrens', name: "Children's Menu", description: 'Smaller portions and family favourites.' }
  ];
  const evening = content.menus.find(m => m.id === 'evening');
  if (evening && !content.menus.some(m => m.id === 'main')) {
    evening.id = 'main'; evening.name = 'Main Menu';
  }
  requiredMenus.forEach(menu => {
    if (!content.menus.some(existing => existing.id === menu.id)) {
      content.menus.push({ ...menu, active: true, dishes: [] });
    }
  });
  content.menus.forEach(menu => {
    if (typeof menu.active !== 'boolean') menu.active = true;
    menu.dishes = Array.isArray(menu.dishes) ? menu.dishes : [];
    menu.dishes.forEach(dish => { if (typeof dish.active !== 'boolean') dish.active = true; });
  });
  return content;
}
function readContent() {
  ensureData();
  try {
    const raw = fs.readFileSync(dataFile, 'utf8');
    const content = normaliseContent(JSON.parse(raw));
    writeContent(content);
    return content;
  } catch (error) {
    console.error('Content data was invalid and has been reset:', error.message);
    const backup = `${dataFile}.invalid-${Date.now()}`;
    try { if (fs.existsSync(dataFile)) fs.copyFileSync(dataFile, backup); } catch {}
    const restored = normaliseContent(JSON.parse(JSON.stringify(defaultContent)));
    writeContent(restored);
    return restored;
  }
}
function writeContent(content) {
  ensureData();
  const temp = `${dataFile}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(content, null, 2));
  fs.renameSync(temp, dataFile);
}
function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 1_000_000) reject(new Error('Request too large')); });
    req.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error('Invalid JSON')); } });
    req.on('error', reject);
  });
}
function sign(value) { return crypto.createHmac('sha256', sessionSecret).update(value).digest('hex'); }
function makeSession() {
  const expiry = Date.now() + 8 * 60 * 60 * 1000;
  const value = `${adminUser}|${expiry}`;
  return `${Buffer.from(value).toString('base64url')}.${sign(value)}`;
}
function validSession(req) {
  const cookies = Object.fromEntries((req.headers.cookie || '').split(';').map(v => v.trim().split('=').map(decodeURIComponent)).filter(v => v.length === 2));
  const authHeader = req.headers.authorization || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const token = bearerToken || cookies.vl_admin;
  if (!token || !token.includes('.')) return false;
  const [encoded, signature] = token.split('.');
  let value;
  try { value = Buffer.from(encoded, 'base64url').toString(); } catch { return false; }
  if (!crypto.timingSafeEqual(Buffer.from(sign(value)), Buffer.from(signature))) return false;
  const [user, expiry] = value.split('|');
  return user === adminUser && Number(expiry) > Date.now();
}
function safeEqual(a, b) {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function sanitiseContent(input) {
  if (!input || typeof input !== 'object') throw new Error('Invalid content');
  const output = { settings: input.settings || {}, menus: Array.isArray(input.menus) ? input.menus : [], events: Array.isArray(input.events) ? input.events : [] };
  if (JSON.stringify(output).length > 900000) throw new Error('Content is too large');
  return output;
}

ensureData();

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}
function pageShell({ title, eyebrow, heading, intro, body, compact = false }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} | Village Limits</title><meta name="description" content="${escapeHtml(intro || heading)}"><link rel="stylesheet" href="/assets/css/styles.css"></head><body><div data-header></div><section class="page-hero${compact ? ' compact' : ''}"><div class="container"><div class="eyebrow">${escapeHtml(eyebrow)}</div><h1>${escapeHtml(heading)}</h1><p>${escapeHtml(intro || '')}</p></div></section>${body}<div data-footer></div><script src="/assets/js/site.js"></script></body></html>`;
}
function menuIcon(id) {
  return ({ main: '🍽', sunday: '🍖', specials: '★', desserts: '🍰', childrens: '◌' })[id] || '◆';
}
function renderEatPage() {
  const content = readContent();
  const menus = content.menus.filter(menu => menu.active);
  const cards = menus.length ? menus.map(menu => `
    <a class="menu-choice" href="/menu?id=${encodeURIComponent(menu.id)}">
      <span class="menu-choice-icon" aria-hidden="true">${menuIcon(menu.id)}</span>
      <span class="eyebrow">View menu</span>
      <h2>${escapeHtml(menu.name)}</h2>
      <p>${escapeHtml(menu.description || '')}</p>
      <span class="menu-choice-link">Open menu <span aria-hidden="true">→</span></span>
    </a>`).join('') : '<div class="empty-menu"><h2>Menus are being updated</h2><p>Please contact us for today’s availability.</p></div>';
  return pageShell({
    title: 'Menus', eyebrow: 'Restaurant', heading: 'Our menus',
    intro: 'Choose from our current menus. Hidden menus are automatically removed from this page.',
    body: `<section class="section menu-section"><div class="container"><div class="menu-directory">${cards}</div></div></section>
    <section class="section alt"><div class="container split"><div><div class="eyebrow">Dining at Village Limits</div><h2>Freshly prepared and regularly updated</h2><p class="lead">Our menus change with the seasons and availability. Specials may change daily.</p><p>Please speak to a member of the team before ordering if you have any allergies or dietary requirements.</p><div class="actions"><a class="btn" href="/book-table">Book a Table</a><a class="btn outline" href="/contact">Contact Us</a></div></div><img src="/assets/images/food2.webp" alt="Food served at Village Limits"></div></section>`
  });
}
function renderMenuPage(id) {
  const content = readContent();
  const menu = content.menus.find(item => item.id === id && item.active);
  if (!menu) return pageShell({ title: 'Menu unavailable', eyebrow: 'Village Limits', heading: 'Menu unavailable', intro: 'This menu is not currently available.', compact: true, body: '<section class="section"><div class="container empty-menu"><h2>Please choose another menu</h2><p>Only menus currently available are shown on our menu page.</p><a class="btn" href="/eat">View available menus</a></div></section>' });
  const dishes = (menu.dishes || []).filter(dish => dish.active);
  const sections = [...new Set(dishes.map(dish => dish.section || 'Menu'))];
  const menuBody = dishes.length ? sections.map(section => `<section class="dynamic-menu"><div class="menu-section-heading"><div class="eyebrow">${escapeHtml(section)}</div><h2>${escapeHtml(section)}</h2></div><div class="menu-list">${dishes.filter(d => (d.section || 'Menu') === section).map(d => `<article class="dish"><div class="dish-row"><h3>${escapeHtml(d.name)}</h3><span class="price">${escapeHtml(d.price || '')}</span></div>${d.description ? `<p>${escapeHtml(d.description)}</p>` : ''}${d.allergens ? `<div class="allergens">Contains: ${escapeHtml(d.allergens)}</div>` : ''}</article>`).join('')}</div></section>`).join('') : '<div class="empty-menu"><h2>Menu details coming soon</h2><p>Please contact us for current dishes and prices.</p></div>';
  return pageShell({ title: menu.name, eyebrow: 'Village Limits', heading: menu.name, intro: menu.description || '', compact: true, body: `<section class="section"><div class="container menu-page">${menuBody}<div class="menu-back"><a href="/eat">← Back to all menus</a></div></div></section><section class="section alt"><div class="container centre"><p>Please inform a member of the team about any allergies or dietary requirements before ordering.</p><a class="btn" href="/book-table">Book a Table</a></div></section>` });
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = decodeURIComponent(url.pathname);

    if (pathname === '/api/health' && req.method === 'GET') return json(res, 200, { ok: true, dataFile });
    if (pathname === '/api/content' && req.method === 'GET') return json(res, 200, readContent());
    if (pathname === '/api/admin/status' && req.method === 'GET') return json(res, 200, { authenticated: validSession(req), usingDefaultPassword: adminPassword === 'ChangeMe-Immediately' });
    if (pathname === '/api/admin/login' && req.method === 'POST') {
      const body = await parseBody(req);
      if (!safeEqual(body.username || '', adminUser) || !safeEqual(body.password || '', adminPassword)) return json(res, 401, { error: 'Incorrect username or password' });
      const token = makeSession();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Set-Cookie': `vl_admin=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=28800`, 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify({ ok: true, token }));
    }
    if (pathname === '/api/admin/logout' && req.method === 'POST') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Set-Cookie': 'vl_admin=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify({ ok: true }));
    }
    if (pathname === '/api/admin/content' && req.method === 'GET') {
      if (!validSession(req)) return json(res, 401, { error: 'Unauthorised' });
      return json(res, 200, readContent());
    }
    if (pathname === '/api/admin/content' && req.method === 'PUT') {
      if (!validSession(req)) return json(res, 401, { error: 'Unauthorised' });
      const body = sanitiseContent(await parseBody(req));
      writeContent(body);
      return json(res, 200, { ok: true });
    }

    if (pathname === '/eat' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(renderEatPage());
    }
    if (pathname === '/menu' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(renderMenuPage(url.searchParams.get('id') || ''));
    }

    const clean = pathname === '/' ? '/index.html' : pathname;
    let filePath = path.normalize(path.join(root, clean));
    if (!filePath.startsWith(root)) { res.writeHead(403); return res.end('Forbidden'); }
    if (!path.extname(filePath)) filePath += '.html';
    fs.stat(filePath, (err, stat) => {
      if (err || !stat.isFile()) filePath = path.join(root, '404.html');
      fs.readFile(filePath, (readErr, data) => {
        if (readErr) { res.writeHead(500); return res.end('Server error'); }
        res.writeHead(filePath.endsWith('404.html') ? 404 : 200, {
          'Content-Type': mime[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
          'Cache-Control': filePath.endsWith('.html') ? 'no-cache' : 'public, max-age=604800'
        });
        res.end(data);
      });
    });
  } catch (error) {
    json(res, 400, { error: error.message || 'Request failed' });
  }
}).listen(port, () => console.log(`Village Limits website running on port ${port}`));
