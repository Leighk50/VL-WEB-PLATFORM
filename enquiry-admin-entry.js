"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const http = require("http");

const USER = process.env.ADMIN_USERNAME || "admin";
const SECRET = process.env.SESSION_SECRET || "replace-this-secret";
const DATA_DIR = process.env.CONTENT_DATA_DIR || (process.env.HOME ? path.join(process.env.HOME, "site", "data") : path.join(__dirname, "data"));
const ENQUIRIES_FILE = path.join(DATA_DIR, "enquiries.json");

const FORM_ROUTES = new Map([
  ["/contact/enquire", "Contact"],
  ["/christmas/enquire", "Christmas"],
  ["/afternoon-tea/enquire", "Afternoon Tea"],
  ["/private-events/enquire", "Private Event"]
]);

function sign(value) {
  return crypto.createHmac("sha256", SECRET).update(value).digest("hex");
}

function tokenFromRequest(req) {
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7);
  const cookie = (req.headers.cookie || "")
    .split(";")
    .map(x => x.trim())
    .find(x => x.startsWith("vl_admin="));
  return cookie ? decodeURIComponent(cookie.slice(9)) : "";
}

function validAdmin(req) {
  const token = tokenFromRequest(req);
  if (!token.includes(".")) return false;
  const [encoded, signature] = token.split(".");
  let raw = "";
  try { raw = Buffer.from(encoded, "base64url").toString(); } catch { return false; }
  const expected = sign(raw);
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false;
  const [user, expires] = raw.split("|");
  return user === USER && Number(expires) > Date.now();
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type":"application/json; charset=utf-8",
    "Cache-Control":"no-store",
    "X-Content-Type-Options":"nosniff"
  });
  res.end(JSON.stringify(payload));
}

function readJsonBody(req, max = 50000) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", chunk => {
      raw += chunk;
      if (raw.length > max) reject(new Error("Request too large"));
    });
    req.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch { reject(new Error("Invalid JSON")); }
    });
    req.on("error", reject);
  });
}

function readEnquiries() {
  try {
    const value = JSON.parse(fs.readFileSync(ENQUIRIES_FILE, "utf8"));
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}

function writeEnquiries(items) {
  fs.mkdirSync(DATA_DIR, {recursive:true});
  const temp = ENQUIRIES_FILE + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(items, null, 2), {encoding:"utf8", mode:0o600});
  fs.renameSync(temp, ENQUIRIES_FILE);
  try { fs.chmodSync(ENQUIRIES_FILE, 0o600); } catch {}
}

function cleanText(value, max = 4000) {
  return String(value || "").trim().slice(0, max);
}

function createEnquiry(type, body) {
  const p = new URLSearchParams(body);
  const details = {};
  for (const [key, value] of p.entries()) {
    if (key === "form_token" || key === "contact_reference") continue;
    details[key] = cleanText(value);
  }
  return {
    id: crypto.randomUUID(),
    receivedAt: new Date().toISOString(),
    type,
    name: cleanText(p.get("name"), 120),
    email: cleanText(p.get("email"), 180),
    phone: cleanText(p.get("phone"), 60),
    details,
    dealtWith: false,
    dealtWithAt: null
  };
}

function saveSubmittedEnquiry(type, rawBody) {
  if (!rawBody) return;
  const items = readEnquiries();
  items.unshift(createEnquiry(type, rawBody));
  writeEnquiries(items.slice(0, 2000));
}

async function handleAdminApi(req, res, pathname) {
  if (pathname !== "/api/admin/enquiries" && !pathname.startsWith("/api/admin/enquiries/")) return false;
  if (!validAdmin(req)) {
    sendJson(res, 401, {error:"Your admin session has expired. Please sign in again."});
    return true;
  }

  if (pathname === "/api/admin/enquiries" && req.method === "GET") {
    const enquiries = readEnquiries().sort((a,b) => String(b.receivedAt).localeCompare(String(a.receivedAt)));
    sendJson(res, 200, {enquiries});
    return true;
  }

  if (pathname.startsWith("/api/admin/enquiries/") && req.method === "PUT") {
    const id = decodeURIComponent(pathname.slice("/api/admin/enquiries/".length));
    try {
      const payload = await readJsonBody(req);
      const items = readEnquiries();
      const item = items.find(x => x.id === id);
      if (!item) { sendJson(res, 404, {error:"Enquiry not found."}); return true; }
      item.dealtWith = Boolean(payload.dealtWith);
      item.dealtWithAt = item.dealtWith ? new Date().toISOString() : null;
      writeEnquiries(items);
      sendJson(res, 200, {ok:true, enquiry:item});
      return true;
    } catch (err) {
      sendJson(res, 400, {error:err.message || "Could not update enquiry."});
      return true;
    }
  }

  sendJson(res, 405, {error:"Method not allowed"});
  return true;
}

const originalCreateServer = http.createServer;
http.createServer = function enquiryCreateServer(options, requestListener) {
  const listener = typeof options === "function" ? options : requestListener;
  const serverOptions = typeof options === "function" ? undefined : options;

  const wrapped = async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const pathname = decodeURIComponent(url.pathname);
    if (await handleAdminApi(req, res, pathname)) return;

    const type = req.method === "POST" ? FORM_ROUTES.get(pathname) : null;
    if (!type) return listener(req, res);

    let rawBody = "";
    req.on("data", chunk => {
      if (rawBody.length < 120000) rawBody += chunk;
    });

    const originalEnd = res.end;
    let recorded = false;
    res.end = function patchedEnd(chunk, encoding, callback) {
      const result = originalEnd.call(this, chunk, encoding, callback);
      if (!recorded && res.statusCode >= 200 && res.statusCode < 400) {
        recorded = true;
        try { saveSubmittedEnquiry(type, rawBody); }
        catch (err) { console.error("Could not save enquiry admin record", err.message); }
      }
      return result;
    };

    return listener(req, res);
  };

  return serverOptions === undefined
    ? originalCreateServer.call(http, wrapped)
    : originalCreateServer.call(http, serverOptions, wrapped);
};

require("./seo-entry");
