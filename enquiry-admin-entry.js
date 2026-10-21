"use strict";

const crypto = require("crypto");
const http = require("http");

const USER = process.env.ADMIN_USERNAME || "admin";
const SECRET = process.env.SESSION_SECRET || "replace-this-secret";
const {readEnquiries, writeEnquiries} = require("./enquiry-store");

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

async function handleAdminApi(req, res, pathname) {
  if (pathname !== "/api/admin/enquiries" && !pathname.startsWith("/api/admin/enquiries/")) return false;
  if (!validAdmin(req)) {
    sendJson(res, 401, {error:"Your admin session has expired. Please sign in again."});
    return true;
  }

  if (pathname === "/api/admin/enquiries" && req.method === "GET") {
    try {
      const enquiries = readEnquiries().sort((a,b) => String(b.receivedAt).localeCompare(String(a.receivedAt)));
      sendJson(res, 200, {enquiries});
    } catch (error) {
      console.error("Could not read enquiry records", error);
      sendJson(res, 500, {error:"Enquiry records could not be read. Please contact the website administrator."});
    }
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

    return listener(req, res);
  };

  return serverOptions === undefined
    ? originalCreateServer.call(http, wrapped)
    : originalCreateServer.call(http, serverOptions, wrapped);
};

require("./seo-entry");
