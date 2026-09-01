"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const http = require("http");

const USER = process.env.ADMIN_USERNAME || "admin";
const SECRET = process.env.SESSION_SECRET || "replace-this-secret";
const WEBEX_TOKEN = process.env.WEBEX_INTERACT_TOKEN || process.env.WEBEX_API_TOKEN || process.env.WEBEX_TOKEN || process.env["Webex API"] || "";
const WEBEX_ENDPOINT = "https://api.webexinteract.com/v1/sms";
const DATA_DIR = process.env.CONTENT_DATA_DIR || (process.env.HOME ? path.join(process.env.HOME, "site", "data") : path.join(__dirname, "data"));
const KEY_SAFE_FILE = path.join(DATA_DIR, "key-safe-codes.json");
const CONTENT_FILE = path.join(DATA_DIR, "content.json");
const ALLOWED_SENDERS = new Map([
  ["447860008022", "+447860008022"],
  ["+447860008022", "+447860008022"],
  ["VLimits", "VLimits"]
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
  try {
    raw = Buffer.from(encoded, "base64url").toString();
  } catch {
    return false;
  }
  const expected = sign(raw);
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false;
  const [user, expires] = raw.split("|");
  return user === USER && Number(expires) > Date.now();
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "SAMEORIGIN"
  });
  res.end(JSON.stringify(payload));
}

function readJsonBody(req, max = 100000) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", chunk => {
      raw += chunk;
      if (raw.length > max) reject(new Error("Request too large"));
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function emptyCodes() {
  return {"1":"","2":"","3":"","4":"","5":"","6":""};
}

function readKeySafeCodes() {
  try {
    const saved = JSON.parse(fs.readFileSync(KEY_SAFE_FILE, "utf8"));
    const codes = emptyCodes();
    for (let room = 1; room <= 6; room++) codes[String(room)] = String(saved[String(room)] || "");
    return codes;
  } catch {
    return emptyCodes();
  }
}

function writeKeySafeCodes(input) {
  fs.mkdirSync(DATA_DIR, {recursive:true});
  const codes = emptyCodes();
  for (let room = 1; room <= 6; room++) {
    const value = String((input || {})[String(room)] || "").trim();
    if (value && !/^\d{1,12}$/.test(value)) throw new Error(`Room ${room} code must contain digits only.`);
    codes[String(room)] = value;
  }
  const temp = KEY_SAFE_FILE + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(codes, null, 2), {encoding:"utf8", mode:0o600});
  fs.renameSync(temp, KEY_SAFE_FILE);
  try { fs.chmodSync(KEY_SAFE_FILE, 0o600); } catch {}
  return codes;
}

// Remove any key-safe values that an earlier draft may have placed in the public content store.
function scrubLegacyPublicCodes() {
  try {
    if (!fs.existsSync(CONTENT_FILE)) return;
    const content = JSON.parse(fs.readFileSync(CONTENT_FILE, "utf8").replace(/^\uFEFF/, ""));
    if (!content.settings) return;
    let changed = false;
    for (let room = 1; room <= 6; room++) {
      const key = `keySafeRoom${room}`;
      if (Object.prototype.hasOwnProperty.call(content.settings, key)) {
        delete content.settings[key];
        changed = true;
      }
    }
    if (!changed) return;
    const temp = CONTENT_FILE + ".keysafe-cleanup.tmp";
    fs.writeFileSync(temp, JSON.stringify(content, null, 2), "utf8");
    fs.renameSync(temp, CONTENT_FILE);
  } catch (err) {
    console.error("Key-safe public-content cleanup failed", err.message);
  }
}

function normalizePhone(value) {
  let phone = String(value || "").trim().replace(/[\s()-]/g, "");
  if (phone.startsWith("0044")) phone = "+44" + phone.slice(4);
  else if (phone.startsWith("0")) phone = "+44" + phone.slice(1);
  else if (/^44\d+$/.test(phone)) phone = "+" + phone;
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) throw new Error("Invalid destination mobile number.");
  return phone;
}

function normalizeSmsRequest(payload) {
  const from = ALLOWED_SENDERS.get(String(payload.from || ""));
  if (!from) throw new Error("Invalid SMS sender.");
  if (!Array.isArray(payload.items) || payload.items.length < 1 || payload.items.length > 20) throw new Error("Choose between 1 and 20 messages.");
  const items = payload.items.map((item, index) => {
    const message = String(item.message || "").trim();
    if (!message) throw new Error(`Message ${index + 1} is empty.`);
    if (message.length > 1200) throw new Error(`Message ${index + 1} is too long.`);
    return {
      phone: normalizePhone(item.phone),
      message,
      reference: String(item.reference || `guest-${index + 1}`).replace(/[^a-zA-Z0-9._:-]/g, "-").slice(0, 100)
    };
  });
  return {from, items};
}

async function webexSendOne(from, item, testOnly = false) {
  if (!WEBEX_TOKEN) throw new Error("Webex SMS is not configured in Azure.");
  const response = await fetch(`${WEBEX_ENDPOINT}${testOnly ? "/test" : ""}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-AUTH-KEY": WEBEX_TOKEN
    },
    body: JSON.stringify({
      message_body: item.message,
      from,
      to: [{correlation_id:item.reference, phone:[item.phone]}]
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = Array.isArray(data.errors) && data.errors[0] ? data.errors[0].message : "Webex rejected the message.";
    const err = new Error(response.status === 401 || response.status === 403 ? "Webex authentication failed. Check the Azure API token." : detail);
    err.status = response.status;
    throw err;
  }
  const envelope = Array.isArray(data) ? data[0] : data;
  const message = envelope && Array.isArray(envelope.messages) ? envelope.messages[0] : null;
  return {
    requestId: envelope && envelope.request_id ? envelope.request_id : null,
    transactionId: message && message.transaction_id ? message.transaction_id : null,
    status: message && message.status ? message.status : (testOnly ? "validated" : "accepted")
  };
}

async function sendBatch(payload, testOnly = false) {
  const {from, items} = normalizeSmsRequest(payload);
  const results = [];
  for (const item of items) {
    try {
      const result = await webexSendOne(from, item, testOnly);
      results.push({reference:item.reference, ok:true, ...result});
    } catch (err) {
      results.push({reference:item.reference, ok:false, error:err.message});
    }
  }
  return {
    queued: results.filter(x => x.ok).length,
    failed: results.filter(x => !x.ok).length,
    testOnly,
    results
  };
}

async function handleSmsAdmin(req, res, pathname) {
  if (!pathname.startsWith("/api/admin/guest-sms/") && pathname !== "/api/admin/key-safe-codes") return false;
  if (!validAdmin(req)) {
    sendJson(res, 401, {error:"Your admin session has expired. Please sign in again."});
    return true;
  }

  try {
    if (pathname === "/api/admin/key-safe-codes" && req.method === "GET") {
      sendJson(res, 200, {codes:readKeySafeCodes()});
      return true;
    }
    if (pathname === "/api/admin/key-safe-codes" && req.method === "PUT") {
      const payload = await readJsonBody(req);
      sendJson(res, 200, {ok:true, codes:writeKeySafeCodes(payload.codes)});
      return true;
    }
    if (pathname === "/api/admin/guest-sms/status" && req.method === "GET") {
      sendJson(res, 200, {configured:Boolean(WEBEX_TOKEN), senders:["+447860008022", "VLimits"]});
      return true;
    }
    if ((pathname === "/api/admin/guest-sms/send" || pathname === "/api/admin/guest-sms/test") && req.method === "POST") {
      const result = await sendBatch(await readJsonBody(req), pathname.endsWith("/test"));
      const status = result.failed && !result.queued ? 502 : 200;
      sendJson(res, status, result.failed && !result.queued ? {...result, error:result.results[0]?.error || "SMS send failed"} : result);
      return true;
    }
    sendJson(res, 405, {error:"Method not allowed"});
    return true;
  } catch (err) {
    sendJson(res, 400, {error:err.message || "SMS request failed"});
    return true;
  }
}

scrubLegacyPublicCodes();

const originalCreateServer = http.createServer;
http.createServer = function patchedCreateServer(options, requestListener) {
  const listener = typeof options === "function" ? options : requestListener;
  const serverOptions = typeof options === "function" ? undefined : options;
  const wrapped = async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      if (await handleSmsAdmin(req, res, decodeURIComponent(url.pathname))) return;
      return listener(req, res);
    } catch (err) {
      if (!res.headersSent) sendJson(res, 500, {error:"Guest SMS service error."});
      else res.end();
      console.error("Guest SMS service error", err.message);
    }
  };
  return serverOptions === undefined
    ? originalCreateServer.call(http, wrapped)
    : originalCreateServer.call(http, serverOptions, wrapped);
};

require("./server");
