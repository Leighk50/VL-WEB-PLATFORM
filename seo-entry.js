"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const SITE = (process.env.PUBLIC_SITE_URL || "https://www.villagelimits.co.uk").replace(/\/+$/, "");
const INDEXNOW_KEY = "d53a7b019a5e4c1d8e62bf94c3a710ee";
const INDEXNOW_KEY_PATH = `/${INDEXNOW_KEY}.txt`;
const INDEXNOW_ENDPOINT = "https://api.indexnow.org/IndexNow";
const DATA_DIR = process.env.CONTENT_DATA_DIR || (process.env.HOME ? path.join(process.env.HOME, "site", "data") : path.join(__dirname, "data"));
const CONTENT_FILE = path.join(DATA_DIR, "content.json");
const originalCreateServer = http.createServer;

const SEO_REDIRECTS = new Map([
  ["/live-entertainment-psychic-evenings-woodhall-spa/", "/whats-on"],
  ["/live-entertainment-woodhall-spa/", "/whats-on"],
  ["/accommodation/", "/stay"],
  ["/bed-and-breakfast-hotel-woodhall-spa/", "/stay"],
  ["/restaurant-woodhall-spa/", "/eat"],
  ["/pub-food-woodhall-spa/", "/eat"],
  ["/woodhall-spa-pubs/", "/eat"]
]);

const HTML_PATHS = new Set([
  "/",
  "/eat",
  "/stay",
  "/whats-on",
  "/christmas",
  "/private-events",
  "/contact",
  "/menu/main",
  "/menu/sunday"
]);

const CORE_INDEX_URLS = [
  "/",
  "/eat",
  "/stay",
  "/whats-on",
  "/afternoon-tea",
  "/christmas",
  "/private-events",
  "/contact",
  "/menu/main",
  "/menu/sunday"
];

function normalisePath(pathname) {
  if (pathname === "/") return pathname;
  return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

function xmlEscape(value) {
  return String(value).replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&apos;"}[ch]));
}

function contentLastModified() {
  try {
    return fs.statSync(CONTENT_FILE).mtime.toISOString();
  } catch {
    try {
      return fs.statSync(path.join(__dirname, "server.js")).mtime.toISOString();
    } catch {
      return new Date().toISOString();
    }
  }
}

function knownExpiredEventUrls() {
  try {
    const content = JSON.parse(fs.readFileSync(CONTENT_FILE, "utf8").replace(/^\uFEFF/, ""));
    return new Set((content.events || [])
      .filter(event => event && event.id && /sarah-jane jazz/i.test(String(event.title || "")))
      .map(event => `${SITE}/event/${encodeURIComponent(event.id)}`));
  } catch {
    return new Set();
  }
}

function enrichSitemap(xml) {
  const lastmod = contentLastModified();
  const expired = knownExpiredEventUrls();
  return String(xml).replace(/<url><loc>(.*?)<\/loc>(?:<lastmod>.*?<\/lastmod>)?<\/url>/g, (_m, loc) =>
    expired.has(loc) ? "" : `<url><loc>${loc}</loc><lastmod>${xmlEscape(lastmod)}</lastmod></url>`
  );
}

function currentIndexUrls() {
  const urls = new Set(CORE_INDEX_URLS.map(p => `${SITE}${p}`));
  try {
    const content = JSON.parse(fs.readFileSync(CONTENT_FILE, "utf8").replace(/^\uFEFF/, ""));
    for (const menu of content.menus || []) {
      if (menu && menu.visible && menu.id) urls.add(`${SITE}/menu/${encodeURIComponent(menu.id)}`);
    }
    for (const event of content.events || []) {
      if (event && event.visible && event.id && !/sarah-jane jazz/i.test(String(event.title || ""))) {
        urls.add(`${SITE}/event/${encodeURIComponent(event.id)}`);
      }
    }
  } catch {}
  return [...urls];
}

async function submitIndexNow(urls, reason = "update") {
  const host = new URL(SITE).host;
  const list = [...new Set((urls || []).filter(Boolean))].filter(url => {
    try { return new URL(url).host === host; } catch { return false; }
  });
  if (!list.length) return;
  try {
    const response = await fetch(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: {"Content-Type":"application/json; charset=utf-8"},
      body: JSON.stringify({
        host,
        key: INDEXNOW_KEY,
        keyLocation: `${SITE}${INDEXNOW_KEY_PATH}`,
        urlList: list
      })
    });
    if (!response.ok && response.status !== 202) {
      console.warn("IndexNow submission failed", reason, response.status, (await response.text()).slice(0, 500));
    } else {
      console.log("IndexNow submission accepted", reason, response.status, list.length);
    }
  } catch (err) {
    console.warn("IndexNow submission error", reason, err.message);
  }
}

function transformHtml(pathname, html) {
  let body = html
    .replace(/LN10 6QH/g, "LN10 6UJ")
    .replace(/\"streetAddress\":\"Village Limits\"/g, "\"streetAddress\":\"Stixwould Road\"");

  if (pathname === "/contact") {
    body = body.replace(
      /(<h2>Village Limits<\/h2>)<p>.*?<\/p>(<p><strong>Telephone:<\/strong>)/,
      "$1<p>Stixwould Road, Woodhall Spa, Lincolnshire, LN10 6UJ</p>$2"
    );
  }

  if (pathname === "/stay") {
    body = body
      .replace(
        "Accommodation Woodhall Spa | Rooms at Village Limits",
        "Rooms & Accommodation Woodhall Spa | Village Limits"
      )
      .replace(
        "Stay at Village Limits in Woodhall Spa, Lincolnshire. Comfortable air-conditioned guest rooms, free parking and Wi-Fi, with restaurant dining and entertainment on site.",
        "Book rooms and accommodation in Woodhall Spa at Village Limits. Six air-conditioned guest rooms with breakfast, free parking, Wi-Fi, restaurant dining and entertainment on site."
      )
      .replace(
        "<p>Breakfast is available, and our <a href=\"/eat\">restaurant is on site</a>. Guests can also enjoy <a href=\"/whats-on\">entertainment on site Wednesday to Sunday</a>, making Village Limits a convenient alternative to hotels or bed and breakfast accommodation in Woodhall Spa.</p>",
        "<p>Looking for hotel rooms, a bed and breakfast or comfortable accommodation in Woodhall Spa? Breakfast is available, our <a href=\"/eat\">restaurant is on site</a>, and guests can also enjoy <a href=\"/whats-on\">entertainment on site Wednesday to Sunday</a>. Village Limits is an independent place to stay close to Woodhall Spa village centre and local attractions.</p><h3>Why stay at Village Limits?</h3><p>Our six air-conditioned guest rooms give visitors a convenient base for Woodhall Spa, whether you are staying for a short break, a restaurant visit, an event or time with family and friends. Guests have free on-site parking and Wi-Fi, with breakfast available and direct online booking.</p><ul class=\"feature-list\"><li>Six air-conditioned guest rooms</li><li>Breakfast available</li><li>Free parking and Wi-Fi</li><li>Restaurant dining on site</li><li>Regular entertainment and special events</li><li>Convenient for Woodhall Spa village and local attractions</li></ul><h3>Accommodation FAQs</h3><p><strong>Do you have free parking?</strong><br>Yes, free on-site parking is available for guests.</p><p><strong>Are all rooms air-conditioned?</strong><br>Yes, all six guest rooms are air-conditioned.</p><p><strong>Is breakfast available?</strong><br>Yes, breakfast is available for staying guests.</p>"
      );
  }

  if (pathname === "/menu/main") {
    body = body
      .replace(
        "Main Menu | Village Limits Woodhall Spa",
        "Restaurant Menu Woodhall Spa | Village Limits"
      )
      .replace(
        /<meta name="description" content="View the Main Menu at Village Limits restaurant in Woodhall Spa\. ([^"]*)">/,
        '<meta name="description" content="View the current restaurant menu at Village Limits in Woodhall Spa, including freshly prepared starters, mains, steaks and dishes for relaxed dining in Lincolnshire.">'
      )
      .replace(
        '<section class="section"><div class="container narrow">',
        '<section class="section"><div class="container narrow"><div class="eyebrow">Restaurant menu Woodhall Spa</div><h2>Our current restaurant menu</h2><p class="lead">Explore the current food menu at Village Limits in Woodhall Spa, including freshly prepared starters, mains and steaks. Our restaurant is ideal for relaxed meals, evenings out and special occasions.</p><div class="actions"><a class="btn" href="/menu/sunday">View Sunday Lunch Menu</a></div></div></section><section class="section"><div class="container narrow">'
      );
  }

  if (pathname === "/menu/sunday") {
    body = body
      .replace(
        "Sunday Lunch | Village Limits Woodhall Spa",
        "Sunday Lunch Woodhall Spa | Village Limits"
      )
      .replace(
        /<meta name="description" content="[^"]*Sunday Lunch[^"]*">/,
        '<meta name="description" content="Enjoy Sunday lunch in Woodhall Spa at Village Limits, with traditional Sunday roasts, Lincoln Red beef, slow-roasted pork and seasonal alternatives.">'
      )
      .replace(
        '<section class="section"><div class="container narrow">',
        '<section class="section"><div class="container narrow"><div class="eyebrow">Sunday lunch Woodhall Spa</div><h2>Sunday lunch at Village Limits</h2><p class="lead">Enjoy Sunday lunch in Woodhall Spa at Village Limits, with traditional Sunday roasts including 28-day aged Lincoln Red beef, slow-roasted pork and seasonal alternatives.</p><div class="actions"><a class="btn" href="/menu/main">View Main Restaurant Menu</a></div></div></section><section class="section"><div class="container narrow">'
      );
  }

  if (pathname === "/private-events") {
    body = body
      .replace(
        "Private Events & Celebrations | Village Limits Woodhall Spa",
        "Private Events & Party Venue Woodhall Spa | Village Limits"
      )
      .replace(
        "Plan private dining, celebrations and special occasions at Village Limits in Woodhall Spa.",
        "Plan birthdays, anniversaries, private dining, celebrations of life, corporate events and private parties at Village Limits in Woodhall Spa, Lincolnshire."
      )
      .replace(
        "<p class=\"lead\">From intimate private dining to milestone celebrations, tell us what you are planning and our events team will help bring it together.</p>",
        "<p class=\"lead\">From intimate private dining to milestone celebrations, tell us what you are planning and our events team will help bring it together.</p><p>Village Limits is available for birthdays, anniversaries, private dining, wedding receptions, celebrations of life, corporate occasions and other private events in Woodhall Spa. We can help with food, drinks, entertainment requirements and the details that make the occasion feel personal.</p><h3>Private parties and functions in Woodhall Spa</h3><p>Plan a relaxed meal, drinks reception, family celebration or business gathering with food and hospitality from the Village Limits team. Free on-site parking and our <a href=\"/stay\">six guest rooms</a> are useful for guests travelling from outside Woodhall Spa.</p><h3>Events we can help with</h3><ul class=\"feature-list\"><li>Birthdays and anniversaries</li><li>Private dining and family celebrations</li><li>Wedding receptions and post-wedding gatherings</li><li>Celebrations of life and wakes</li><li>Corporate meals and small business events</li><li>Christmas parties and seasonal celebrations</li></ul><p>Tell us your preferred date, approximate guest numbers, food requirements and entertainment ideas using the enquiry form and our team will discuss availability and options with you.</p>"
      );
  }

  if (pathname === "/" || pathname === "/whats-on") {
    body = body.replace(/<article class="event-card">(?:(?!<\/article>)[\s\S])*?<h[23]>Sarah-Jane Jazz<\/h[23]>(?:(?!<\/article>)[\s\S])*?<\/article>/gi, "");
  }

  return body;
}

http.createServer = function seoCreateServer(options, requestListener) {
  const listener = typeof options === "function" ? options : requestListener;
  const serverOptions = typeof options === "function" ? undefined : options;

  const wrapped = (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const rawPath = decodeURIComponent(url.pathname);
    const redirectKey = rawPath.endsWith("/") ? rawPath : `${rawPath}/`;
    const redirectTarget = SEO_REDIRECTS.get(redirectKey);

    if (rawPath === INDEXNOW_KEY_PATH && req.method === "GET") {
      res.writeHead(200, {
        "Content-Type":"text/plain; charset=utf-8",
        "Cache-Control":"public, max-age=86400"
      });
      res.end(`${INDEXNOW_KEY}\n`);
      return;
    }

    if (redirectTarget) {
      res.writeHead(301, {
        Location: `${SITE}${redirectTarget}`,
        "Cache-Control": "public, max-age=86400"
      });
      res.end();
      return;
    }

    const pathname = normalisePath(rawPath);
    const isHtml = HTML_PATHS.has(pathname) && req.method === "GET";
    const isSitemap = rawPath === "/sitemap.xml" && req.method === "GET";
    const isAdminContentUpdate = rawPath === "/api/admin/content" && req.method === "PUT";

    if (!isHtml && !isSitemap && !isAdminContentUpdate) return listener(req, res);

    const originalEnd = res.end;
    res.end = function patchedEnd(chunk, encoding, callback) {
      const contentType = String(res.getHeader("Content-Type") || "");
      if (chunk != null && isHtml && contentType.includes("text/html")) {
        const source = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
        chunk = transformHtml(pathname, source);
      } else if (chunk != null && isSitemap && (contentType.includes("xml") || contentType.includes("text"))) {
        const source = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
        chunk = enrichSitemap(source);
      }

      const result = originalEnd.call(this, chunk, encoding, callback);
      if (isAdminContentUpdate && res.statusCode >= 200 && res.statusCode < 300) {
        setTimeout(() => submitIndexNow(currentIndexUrls(), "admin-content-update"), 0);
      }
      return result;
    };

    return listener(req, res);
  };

  return serverOptions === undefined
    ? originalCreateServer.call(http, wrapped)
    : originalCreateServer.call(http, serverOptions, wrapped);
};

require("./sms-admin-entry");

setTimeout(() => submitIndexNow(currentIndexUrls(), "deployment-startup"), 5000);
