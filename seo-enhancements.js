"use strict";

const http = require("http");

const SITE = (process.env.PUBLIC_SITE_URL || "https://www.villagelimits.co.uk").replace(/\/+$/, "");
const originalCreateServer = http.createServer;

const TARGET_PATHS = new Set([
  "/",
  "/eat",
  "/christmas",
  "/afternoon-tea",
  "/menu/main",
  "/menu/sunday",
  "/menu/specials"
]);

function normalisePath(pathname) {
  if (pathname === "/") return pathname;
  return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

function injectBeforeFooter(html, block) {
  if (!block) return html;
  if (html.includes('<footer class="footer">')) return html.replace('<footer class="footer">', `${block}<footer class="footer">`);
  if (html.includes('<div data-footer></div>')) return html.replace('<div data-footer></div>', `${block}<div data-footer></div>`);
  return html.replace('</body>', `${block}</body>`);
}

function injectJsonLd(html, data) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return html.replace('</head>', `<script type="application/ld+json">${json}</script></head>`);
}

function breadcrumb(pathname, currentName) {
  const parts = [{name:"Home", url:`${SITE}/`}];
  if (pathname.startsWith('/menu/')) parts.push({name:"Eat", url:`${SITE}/eat`});
  parts.push({name:currentName, url:`${SITE}${pathname}`});
  const items = parts.map((item, index) => ({
    "@type":"ListItem",
    position:index + 1,
    name:item.name,
    item:item.url
  }));
  const visible = `<nav aria-label="Breadcrumb" class="container narrow" style="padding-top:18px;padding-bottom:0"><p style="font-size:.9rem;margin:0"><a href="/">Home</a>${pathname.startsWith('/menu/')?' &rsaquo; <a href="/eat">Eat</a>':''} &rsaquo; ${currentName}</p></nav>`;
  return {visible, schema:{"@context":"https://schema.org","@type":"BreadcrumbList",itemListElement:items}};
}

function faqBlock(items) {
  const visible = `<section class="section alt"><div class="container narrow"><div class="eyebrow">Helpful information</div><h2>Frequently asked questions</h2>${items.map(x=>`<h3>${x.q}</h3><p>${x.a}</p>`).join('')}</div></section>`;
  const schema = {
    "@context":"https://schema.org",
    "@type":"FAQPage",
    mainEntity:items.map(x=>({"@type":"Question",name:x.q,acceptedAnswer:{"@type":"Answer",text:x.a}}))
  };
  return {visible, schema};
}

function restaurantSchema() {
  return {
    "@context":"https://schema.org",
    "@type":"Restaurant",
    name:"Village Limits",
    url:SITE,
    telephone:"01526 353312",
    address:{
      "@type":"PostalAddress",
      streetAddress:"Stixwould Road",
      addressLocality:"Woodhall Spa",
      addressRegion:"Lincolnshire",
      postalCode:"LN10 6UJ",
      addressCountry:"GB"
    },
    hasMenu:[
      `${SITE}/menu/main`,
      `${SITE}/menu/sunday`,
      `${SITE}/menu/specials`,
      `${SITE}/afternoon-tea`
    ]
  };
}

function transform(pathname, html) {
  let body = html;

  if (pathname === "/") {
    const block = `<section class="section"><div class="container narrow"><div class="eyebrow">Restaurant in Woodhall Spa</div><h2>Restaurant, rooms and entertainment in Woodhall Spa</h2><p class="lead">Discover Village Limits for relaxed dining, Sunday lunch, changing specials, afternoon tea, comfortable rooms and memorable entertainment in Woodhall Spa, Lincolnshire.</p><div class="actions"><a class="btn" href="/menu/main">View Main Menu</a><a class="btn secondary" href="/menu/sunday">Sunday Lunch Menu</a><a class="btn secondary" href="/menu/specials">Today’s Specials</a><a class="btn secondary" href="/afternoon-tea">Afternoon Tea</a></div></div></section>`;
    body = injectBeforeFooter(body, block);
    body = injectJsonLd(body, restaurantSchema());
  }

  if (pathname === "/eat") {
    const block = `<section class="section alt"><div class="container narrow"><div class="eyebrow">Explore our menus</div><h2>Menus at Village Limits</h2><p class="lead">See our current restaurant menu, Sunday lunch, changing specials and afternoon tea.</p><div class="actions"><a class="btn" href="/menu/main">Main Restaurant Menu</a><a class="btn secondary" href="/menu/sunday">Sunday Lunch</a><a class="btn secondary" href="/menu/specials">Specials</a><a class="btn secondary" href="/afternoon-tea">Afternoon Tea</a></div></div></section>`;
    body = injectBeforeFooter(body, block);
    body = injectJsonLd(body, restaurantSchema());
  }

  const names = {
    "/menu/main":"Main Restaurant Menu",
    "/menu/sunday":"Sunday Lunch",
    "/menu/specials":"Specials",
    "/afternoon-tea":"Afternoon Tea",
    "/christmas":"Christmas at Village Limits"
  };

  if (names[pathname]) {
    const crumb = breadcrumb(pathname, names[pathname]);
    const heroPattern = /(<section class="page-hero[^>]*>)/;
    if (heroPattern.test(body)) body = body.replace(heroPattern, `${crumb.visible}$1`);
    else body = body.replace('<body>', `<body>${crumb.visible}`);
    body = injectJsonLd(body, crumb.schema);
  }

  if (pathname === "/menu/specials") {
    body = body
      .replace("Specials | Village Limits Woodhall Spa", "Restaurant Specials Woodhall Spa | Village Limits")
      .replace(/<meta name="description" content="[^"]*">/, '<meta name="description" content="See the latest restaurant specials at Village Limits in Woodhall Spa, with changing limited-availability dishes alongside our main menu.">');
    const block = `<section class="section alt"><div class="container narrow"><div class="eyebrow">Restaurant specials Woodhall Spa</div><h2>Changing specials at Village Limits</h2><p class="lead">Our specials change with seasonality and availability, giving you something different alongside the main restaurant menu.</p><div class="actions"><a class="btn" href="/menu/main">View Main Menu</a><a class="btn secondary" href="/menu/sunday">Sunday Lunch Menu</a></div></div></section>`;
    body = injectBeforeFooter(body, block);
  }

  if (pathname === "/menu/sunday") {
    const faq = faqBlock([
      {q:"Where is Sunday lunch served?",a:"Sunday lunch is served at Village Limits on Stixwould Road in Woodhall Spa, Lincolnshire."},
      {q:"What is on the Sunday lunch menu?",a:"The current Sunday menu includes traditional roasts and seasonal alternatives. The latest dishes and prices are shown on this page."},
      {q:"What should I do about allergies or dietary requirements?",a:"Please speak to the Village Limits team about allergies or dietary requirements before ordering so the current menu can be checked with you."}
    ]);
    body = injectBeforeFooter(body, faq.visible);
    body = injectJsonLd(body, faq.schema);
  }

  if (pathname === "/christmas") {
    const faq = faqBlock([
      {q:"Where are Christmas parties held?",a:"Christmas parties are held at Village Limits in Woodhall Spa, Lincolnshire."},
      {q:"How can I enquire about a Christmas party?",a:"Use the Christmas enquiry form on this page or contact Village Limits directly to discuss your preferred date and party size."},
      {q:"Can dietary requirements be discussed?",a:"Yes. Include dietary requirements in your enquiry so the team can discuss the current Christmas menu and suitable options with you."}
    ]);
    body = injectBeforeFooter(body, faq.visible);
    body = injectJsonLd(body, faq.schema);
  }

  if (pathname === "/afternoon-tea") {
    const faq = faqBlock([
      {q:"Where is afternoon tea served?",a:"Afternoon tea is served at Village Limits in Woodhall Spa, Lincolnshire."},
      {q:"How do I enquire about afternoon tea?",a:"Use the enquiry form on this page to send your preferred date, time, party size and package choice."},
      {q:"Can I tell you about dietary requirements?",a:"Yes. Add dietary requirements or allergen information to your enquiry so the team can discuss the current menu with you."}
    ]);
    body = injectBeforeFooter(body, faq.visible);
    body = injectJsonLd(body, faq.schema);
  }

  if (["/menu/main","/menu/sunday","/menu/specials","/afternoon-tea"].includes(pathname)) {
    body = injectJsonLd(body, restaurantSchema());
  }

  return body;
}

http.createServer = function enhancedSeoCreateServer(options, requestListener) {
  const listener = typeof options === "function" ? options : requestListener;
  const serverOptions = typeof options === "function" ? undefined : options;

  const wrapped = (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const pathname = normalisePath(decodeURIComponent(url.pathname));
    if (req.method !== "GET" || !TARGET_PATHS.has(pathname)) return listener(req, res);

    const originalEnd = res.end;
    res.end = function patchedEnd(chunk, encoding, callback) {
      const contentType = String(res.getHeader("Content-Type") || "");
      if (chunk != null && contentType.includes("text/html")) {
        const source = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
        chunk = transform(pathname, source);
      }
      return originalEnd.call(this, chunk, encoding, callback);
    };
    return listener(req, res);
  };

  return serverOptions === undefined
    ? originalCreateServer.call(http, wrapped)
    : originalCreateServer.call(http, serverOptions, wrapped);
};

require("./seo-entry");
