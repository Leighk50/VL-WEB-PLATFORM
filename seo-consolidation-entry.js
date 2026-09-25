"use strict";

const fs = require("fs");
const path = require("path");
const http = require("http");

const SITE = (process.env.PUBLIC_SITE_URL || "https://www.villagelimits.co.uk").replace(/\/+$/, "");
const DATA_DIR = process.env.CONTENT_DATA_DIR || (process.env.HOME ? path.join(process.env.HOME, "site", "data") : path.join(__dirname, "data"));
const CONTENT_FILE = path.join(DATA_DIR, "content.json");

const HARD_REDIRECTS = new Map([
  ["/accommodation/", "/stay"],
  ["/bed-and-breakfast-hotel-woodhall-spa/", "/stay"],
  ["/restaurant-woodhall-spa/", "/eat"],
  ["/restaurants-woodhall-spa-village-limits/", "/eat"],
  ["/pub-food-woodhall-spa/", "/eat"],
  ["/woodhall-spa-pubs/", "/eat"],
  ["/live-entertainment-psychic-evenings-woodhall-spa/", "/whats-on"],
  ["/live-entertainment-woodhall-spa/", "/whats-on"]
]);

function removeExpiredJazz() {
  try {
    if (!fs.existsSync(CONTENT_FILE)) return;
    const data = JSON.parse(fs.readFileSync(CONTENT_FILE, "utf8").replace(/^\uFEFF/, ""));
    const before = Array.isArray(data.events) ? data.events.length : 0;
    data.events = (data.events || []).filter(event => !/sarah-jane jazz/i.test(String(event && event.title || "")));
    if (data.events.length === before) return;
    const temp = CONTENT_FILE + ".expired-event-cleanup.tmp";
    fs.writeFileSync(temp, JSON.stringify(data, null, 2), "utf8");
    fs.renameSync(temp, CONTENT_FILE);
    console.log("Removed expired Sarah-Jane Jazz event from persistent content.");
  } catch (err) {
    console.error("Expired event cleanup failed", err.message);
  }
}

removeExpiredJazz();

const originalCreateServer = http.createServer;
http.createServer = function hardSeoCreateServer(options, requestListener) {
  const listener = typeof options === "function" ? options : requestListener;
  const serverOptions = typeof options === "function" ? undefined : options;
  const wrapped = (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      const raw = decodeURIComponent(url.pathname);
      const key = raw.endsWith("/") ? raw : `${raw}/`;
      const target = HARD_REDIRECTS.get(key);
      if (target) {
        res.writeHead(301, {
          Location: `${SITE}${target}`,
          "Cache-Control": "public, max-age=86400"
        });
        res.end();
        return;
      }
    } catch {}
    return listener(req, res);
  };
  return serverOptions === undefined
    ? originalCreateServer.call(http, wrapped)
    : originalCreateServer.call(http, serverOptions, wrapped);
};

require("./stock-pricing-entry");
