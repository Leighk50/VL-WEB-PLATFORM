const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, 'public');
const port = process.env.PORT || 8080;
const dataDir = process.env.HOME ? path.join(process.env.HOME, 'site', 'data') : path.join(__dirname, 'data');
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
    { id: 'evening', name: 'Evening Menu', description: 'Seasonal dishes and Village Limits favourites.', active: true, dishes: [
      { id: crypto.randomUUID(), section: 'Starters', name: 'Homemade soup of the day', description: 'Served with toasted sourdough.', price: '£8', allergens: 'Gluten, celery', active: true },
      { id: crypto.randomUUID(), section: 'Starters', name: 'Garlic & rosemary focaccia', description: 'Truffle and cauliflower hummus, roasted hazelnuts and crispy onions.', price: '£8.50', allergens: 'Nuts, gluten, sesame', active: true },
      { id: crypto.randomUUID(), section: 'Starters', name: 'Pan-fried chestnut mushrooms', description: 'Garlic and herb vegan butter, toasted sourdough.', price: '£8.50', allergens: 'Gluten, soya', active: true },
      { id: crypto.randomUUID(), section: 'Starters', name: 'Pulled beef rib bonbons', description: 'Burnt cider apple sauce and truffle aioli.', price: '£8.50', allergens: 'Gluten, egg, milk, celery, sulphites, mustard', active: true }
    ]},
    { id: 'sunday', name: 'Sunday Lunch', description: 'Traditional favourites and seasonal accompaniments.', active: true, dishes: [] }
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
function readContent() { ensureData(); return JSON.parse(fs.readFileSync(dataFile, 'utf8')); }
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
  const token = cookies.vl_admin;
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

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = decodeURIComponent(url.pathname);

    if (pathname === '/api/content' && req.method === 'GET') return json(res, 200, readContent());
    if (pathname === '/api/admin/status' && req.method === 'GET') return json(res, 200, { authenticated: validSession(req), usingDefaultPassword: adminPassword === 'ChangeMe-Immediately' });
    if (pathname === '/api/admin/login' && req.method === 'POST') {
      const body = await parseBody(req);
      if (!safeEqual(body.username || '', adminUser) || !safeEqual(body.password || '', adminPassword)) return json(res, 401, { error: 'Incorrect username or password' });
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Set-Cookie': `vl_admin=${encodeURIComponent(makeSession())}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`, 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify({ ok: true }));
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
