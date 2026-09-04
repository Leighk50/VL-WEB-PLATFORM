"use strict";

const http = require("http");

const SITE = (process.env.PUBLIC_SITE_URL || "https://www.villagelimits.co.uk").replace(/\/+$/, "");
const originalCreateServer = http.createServer;

const SEO_REDIRECTS = new Map([
  ["/live-entertainment-psychic-evenings-woodhall-spa/", "/whats-on"],
  ["/live-entertainment-woodhall-spa/", "/whats-on"]
]);

const HTML_PATHS = new Set([
  "/",
  "/eat",
  "/stay",
  "/whats-on",
  "/christmas",
  "/private-events",
  "/contact",
  "/menu/main"
]);

function normalisePath(pathname) {
  if (pathname === "/") return pathname;
  return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
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
        "<p>Looking for hotel rooms, a bed and breakfast or comfortable accommodation in Woodhall Spa? Breakfast is available, our <a href=\"/eat\">restaurant is on site</a>, and guests can also enjoy <a href=\"/whats-on\">entertainment on site Wednesday to Sunday</a>. Village Limits is an independent place to stay close to Woodhall Spa village centre and local attractions.</p>"
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
        '<meta name="description" content="View the current restaurant menu at Village Limits in Woodhall Spa, including freshly prepared starters, mains and dishes for relaxed dining in Lincolnshire.">'
      )
      .replace(
        '<section class="section"><div class="container narrow">',
        '<section class="section"><div class="container narrow"><div class="eyebrow">Restaurant menu Woodhall Spa</div><h2>Our current restaurant menu</h2><p class="lead">Explore the current food menu at Village Limits in Woodhall Spa. Our restaurant serves freshly prepared dishes for relaxed meals, evenings out and special occasions.</p></div></section><section class="section"><div class="container narrow">'
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
        "<p class=\"lead\">From intimate private dining to milestone celebrations, tell us what you are planning and our events team will help bring it together.</p><p>Village Limits is available for birthdays, anniversaries, private dining, wedding receptions, celebrations of life, corporate occasions and other private events in Woodhall Spa. We can help with food, drinks, entertainment requirements and the details that make the occasion feel personal.</p>"
      );
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

    if (redirectTarget) {
      res.writeHead(301, {
        Location: `${SITE}${redirectTarget}`,
        "Cache-Control": "public, max-age=86400"
      });
      res.end();
      return;
    }

    const pathname = normalisePath(rawPath);
    if (!HTML_PATHS.has(pathname) || req.method !== "GET") return listener(req, res);

    const originalEnd = res.end;
    res.end = function patchedEnd(chunk, encoding, callback) {
      const contentType = String(res.getHeader("Content-Type") || "");
      if (chunk != null && contentType.includes("text/html")) {
        const source = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
        chunk = transformHtml(pathname, source);
      }
      return originalEnd.call(this, chunk, encoding, callback);
    };

    return listener(req, res);
  };

  return serverOptions === undefined
    ? originalCreateServer.call(http, wrapped)
    : originalCreateServer.call(http, serverOptions, wrapped);
};

require("./sms-admin-entry");
