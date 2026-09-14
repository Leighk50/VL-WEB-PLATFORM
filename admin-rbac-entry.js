"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const http = require("http");

const OWNER = process.env.ADMIN_USERNAME || "admin";
const OWNER_PASSWORD = process.env.ADMIN_PASSWORD || "ChangeMe-Immediately";
const SECRET = process.env.SESSION_SECRET || "replace-this-secret";
const DATA_DIR = process.env.CONTENT_DATA_DIR || (process.env.HOME ? path.join(process.env.HOME, "site", "data") : path.join(__dirname, "data"));
const USERS_FILE = path.join(DATA_DIR, "admin-users.json");
const CONTENT_FILE = path.join(DATA_DIR, "content.json");
const ALL_PERMISSIONS = ["dashboard", "enquiries", "menus", "specials", "events", "guest_sms", "settings", "users"];
const SECONDARY_PERMISSIONS = ALL_PERMISSIONS.filter(p => p !== "users");
const SESSION_MS = 8 * 60 * 60 * 1000;

function json(res, status, value) {
  res.writeHead(status, {"Content-Type":"application/json; charset=utf-8", "Cache-Control":"no-store", "X-Content-Type-Options":"nosniff"});
  res.end(JSON.stringify(value));
}
function redirect(res, location, cookie) {
  const headers = {Location: location, "Cache-Control":"no-store"};
  if (cookie) headers["Set-Cookie"] = cookie;
  res.writeHead(302, headers); res.end();
}
function sign(raw) { return crypto.createHmac("sha256", SECRET).update(raw).digest("hex"); }
function safeEqual(a, b) {
  const aa = Buffer.from(String(a)); const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}
function tokenFromReq(req) {
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7);
  const cookie = (req.headers.cookie || "").split(";").map(x => x.trim()).find(x => x.startsWith("vl_admin="));
  return cookie ? decodeURIComponent(cookie.slice(9)) : "";
}
function decodeToken(req) {
  const token = tokenFromReq(req);
  if (!token.includes(".")) return null;
  const [encoded, signature] = token.split(".");
  let raw = "";
  try { raw = Buffer.from(encoded, "base64url").toString(); } catch { return null; }
  const expected = sign(raw);
  if (!safeEqual(signature, expected)) return null;
  const [ownerName, expires, effectiveUser] = raw.split("|");
  if (ownerName !== OWNER || !Number(expires) || Number(expires) <= Date.now()) return null;
  return {ownerName, expires:Number(expires), effectiveUser:effectiveUser || OWNER};
}
function makeToken(effectiveUser=OWNER) {
  const raw = effectiveUser === OWNER ? `${OWNER}|${Date.now()+SESSION_MS}` : `${OWNER}|${Date.now()+SESSION_MS}|${effectiveUser}`;
  return `${Buffer.from(raw).toString("base64url")}.${sign(raw)}`;
}
function sessionCookie(token) { return `vl_admin=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${Math.floor(SESSION_MS/1000)}`; }
function clearCookie() { return "vl_admin=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0"; }
function ensureDir() { fs.mkdirSync(DATA_DIR, {recursive:true}); }
function readUsers() {
  ensureDir();
  try {
    const data = JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
    return Array.isArray(data.users) ? data.users : [];
  } catch { return []; }
}
function writeUsers(users) {
  ensureDir();
  const temp = USERS_FILE + ".tmp";
  fs.writeFileSync(temp, JSON.stringify({version:1, users}, null, 2), {encoding:"utf8", mode:0o600});
  fs.renameSync(temp, USERS_FILE);
  try { fs.chmodSync(USERS_FILE, 0o600); } catch {}
}
function hashPassword(password, salt=crypto.randomBytes(16).toString("hex")) {
  return {salt, hash:crypto.scryptSync(String(password), salt, 64).toString("hex")};
}
function verifyPassword(password, user) {
  if (!user?.salt || !user?.passwordHash) return false;
  const actual = crypto.scryptSync(String(password), user.salt, 64).toString("hex");
  return safeEqual(actual, user.passwordHash);
}
function cleanPermissions(value) {
  const list = Array.isArray(value) ? value : [];
  return [...new Set(list.map(String).filter(p => SECONDARY_PERMISSIONS.includes(p)))];
}
function publicUser(user) {
  return {username:user.username, displayName:user.displayName || user.username, enabled:user.enabled !== false, permissions:cleanPermissions(user.permissions), createdAt:user.createdAt, updatedAt:user.updatedAt};
}
function currentIdentity(req) {
  const decoded = decodeToken(req);
  if (!decoded) return null;
  if (decoded.effectiveUser === OWNER) return {username:OWNER, displayName:"Owner", isOwner:true, permissions:[...ALL_PERMISSIONS]};
  const user = readUsers().find(u => u.username.toLowerCase() === decoded.effectiveUser.toLowerCase());
  if (!user || user.enabled === false) return null;
  return {username:user.username, displayName:user.displayName || user.username, isOwner:false, permissions:cleanPermissions(user.permissions)};
}
function has(identity, permission) { return Boolean(identity && (identity.isOwner || identity.permissions.includes(permission))); }
function parseRaw(req, max=250000) {
  return new Promise((resolve, reject) => {
    let raw="";
    req.on("data", chunk => { raw += chunk; if (raw.length > max) reject(new Error("Request too large")); });
    req.on("end", () => resolve(raw)); req.on("error", reject);
  });
}
function parsePayload(raw, contentType) {
  if (!raw) return {};
  if (String(contentType||"").includes("application/json")) { try { return JSON.parse(raw); } catch { return {}; } }
  return Object.fromEntries(new URLSearchParams(raw).entries());
}
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}
function readContent() { return JSON.parse(fs.readFileSync(CONTENT_FILE, "utf8").replace(/^\uFEFF/, "")); }
function writeContent(content) {
  const temp = CONTENT_FILE + ".rbac.tmp";
  fs.writeFileSync(temp, JSON.stringify(content, null, 2), "utf8");
  fs.renameSync(temp, CONTENT_FILE);
}
function requiredPermission(pathname) {
  if (pathname === "/api/admin/test-email") return "dashboard";
  if (pathname === "/api/admin/upload-image") return "events";
  if (pathname === "/admin/specials/print" || pathname.startsWith("/api/admin/specials-sms")) return "specials";
  if (pathname === "/api/admin/key-safe-codes" || pathname.startsWith("/api/admin/guest-sms/")) return "guest_sms";
  if (pathname === "/api/admin/enquiries" || pathname.startsWith("/api/admin/enquiries/")) return "enquiries";
  return null;
}

async function handle(req, res, pathname) {
  if ((pathname === "/admin/login" || pathname === "/api/admin/login") && req.method === "POST") {
    const payload = parsePayload(await parseRaw(req), req.headers["content-type"]);
    const username = String(payload.username || "").trim();
    const password = String(payload.password || "");
    let valid = false;
    let effective = OWNER;
    if (username === OWNER && safeEqual(password, OWNER_PASSWORD)) valid = true;
    else {
      const user = readUsers().find(u => u.username.toLowerCase() === username.toLowerCase());
      if (user && user.enabled !== false && verifyPassword(password, user)) { valid = true; effective = user.username; }
    }
    if (!valid) {
      if (pathname === "/api/admin/login") { json(res, 401, {error:"Incorrect username or password"}); return true; }
      redirect(res, "/admin?login=failed"); return true;
    }
    const token = makeToken(effective);
    if (pathname === "/api/admin/login") {
      res.writeHead(200, {"Content-Type":"application/json; charset=utf-8", "Cache-Control":"no-store", "Set-Cookie":sessionCookie(token)});
      res.end(JSON.stringify({ok:true})); return true;
    }
    redirect(res, "/admin", sessionCookie(token)); return true;
  }

  if ((pathname === "/admin/logout" || pathname === "/api/admin/logout") && req.method === "POST") {
    if (pathname === "/api/admin/logout") {
      res.writeHead(200, {"Content-Type":"application/json; charset=utf-8", "Set-Cookie":clearCookie(), "Cache-Control":"no-store"}); res.end('{"ok":true}');
    } else redirect(res, "/admin", clearCookie());
    return true;
  }

  if (pathname === "/api/admin/status" && req.method === "GET") {
    const identity = currentIdentity(req);
    json(res, 200, {authenticated:Boolean(identity)}); return true;
  }

  if (pathname === "/api/admin/rbac/session" && req.method === "GET") {
    const identity = currentIdentity(req);
    if (!identity) { json(res, 401, {error:"Your admin session has expired."}); return true; }
    json(res, 200, identity); return true;
  }

  if (pathname === "/api/admin/rbac/users" || pathname.startsWith("/api/admin/rbac/users/")) {
    const identity = currentIdentity(req);
    if (!identity) { json(res, 401, {error:"Your admin session has expired."}); return true; }
    if (!identity.isOwner) { json(res, 403, {error:"Only the owner can manage admin users."}); return true; }
    if (["POST","PUT","DELETE"].includes(req.method) && !sameOrigin(req)) { json(res, 403, {error:"Invalid request origin."}); return true; }
    const users = readUsers();
    if (pathname === "/api/admin/rbac/users" && req.method === "GET") { json(res, 200, {users:users.map(publicUser), permissions:SECONDARY_PERMISSIONS}); return true; }
    if (pathname === "/api/admin/rbac/users" && req.method === "POST") {
      const body = parsePayload(await parseRaw(req), req.headers["content-type"]);
      const username = String(body.username||"").trim();
      const displayName = String(body.displayName||username).trim();
      const password = String(body.password||"");
      if (!/^[A-Za-z0-9._-]{3,40}$/.test(username)) { json(res, 400, {error:"Username must be 3–40 characters using letters, numbers, dot, dash or underscore."}); return true; }
      if (username.toLowerCase() === OWNER.toLowerCase() || users.some(u => u.username.toLowerCase() === username.toLowerCase())) { json(res, 409, {error:"That username already exists."}); return true; }
      if (password.length < 10) { json(res, 400, {error:"Password must be at least 10 characters."}); return true; }
      const hp = hashPassword(password); const now = new Date().toISOString();
      users.push({username, displayName, salt:hp.salt, passwordHash:hp.hash, permissions:cleanPermissions(body.permissions), enabled:body.enabled !== false, createdAt:now, updatedAt:now});
      writeUsers(users); json(res, 201, {ok:true, user:publicUser(users[users.length-1])}); return true;
    }
    const target = decodeURIComponent(pathname.slice("/api/admin/rbac/users/".length));
    const index = users.findIndex(u => u.username.toLowerCase() === target.toLowerCase());
    if (index < 0) { json(res, 404, {error:"Admin user not found."}); return true; }
    if (req.method === "PUT") {
      const body = parsePayload(await parseRaw(req), req.headers["content-type"]);
      users[index].displayName = String(body.displayName || users[index].displayName || users[index].username).trim();
      users[index].permissions = cleanPermissions(body.permissions);
      users[index].enabled = body.enabled !== false;
      if (body.password) {
        if (String(body.password).length < 10) { json(res, 400, {error:"New password must be at least 10 characters."}); return true; }
        const hp = hashPassword(String(body.password)); users[index].salt=hp.salt; users[index].passwordHash=hp.hash;
      }
      users[index].updatedAt = new Date().toISOString(); writeUsers(users); json(res, 200, {ok:true, user:publicUser(users[index])}); return true;
    }
    if (req.method === "DELETE") { users.splice(index,1); writeUsers(users); json(res, 200, {ok:true}); return true; }
    json(res, 405, {error:"Method not allowed."}); return true;
  }

  if (pathname === "/api/admin/content") {
    const identity = currentIdentity(req);
    if (!identity) { json(res, 401, {error:"Your admin session is not authorised. Please sign in again."}); return true; }
    if (req.method === "GET") return false;
    if (req.method === "PUT" && !identity.isOwner) {
      if (!sameOrigin(req)) { json(res, 403, {error:"Invalid request origin."}); return true; }
      const submitted = parsePayload(await parseRaw(req, 2000000), req.headers["content-type"]);
      const current = readContent();
      let changed = false;
      if (has(identity,"menus") && Array.isArray(submitted.menus)) { current.menus = submitted.menus; changed = true; }
      if (has(identity,"events") && Array.isArray(submitted.events)) { current.events = submitted.events; changed = true; }
      if (has(identity,"settings") && submitted.settings && typeof submitted.settings === "object") { current.settings = submitted.settings; changed = true; }
      if (!changed) { json(res, 403, {error:"Your account does not have permission to change website content."}); return true; }
      writeContent(current); json(res, 200, {ok:true}); return true;
    }
  }

  const identity = currentIdentity(req);
  const permission = requiredPermission(pathname);
  if (permission && !has(identity, permission)) {
    if (!identity) { json(res, 401, {error:"Your admin session has expired."}); return true; }
    json(res, 403, {error:"Your account does not have access to this admin area."}); return true;
  }
  if (pathname.startsWith("/api/admin/") && identity && !identity.isOwner && !permission && !["/api/admin/content","/api/admin/status","/api/admin/logout"].includes(pathname)) {
    json(res, 403, {error:"Your account does not have access to this admin function."}); return true;
  }
  return false;
}

const originalCreateServer = http.createServer;
http.createServer = function rbacCreateServer(options, requestListener) {
  const listener = typeof options === "function" ? options : requestListener;
  const serverOptions = typeof options === "function" ? undefined : options;
  const wrapped = async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      if (await handle(req, res, decodeURIComponent(url.pathname))) return;
      return listener(req, res);
    } catch (err) {
      console.error("Admin RBAC error", err);
      if (!res.headersSent) json(res, 500, {error:"Admin access request failed."}); else res.end();
    }
  };
  return serverOptions === undefined ? originalCreateServer.call(http, wrapped) : originalCreateServer.call(http, serverOptions, wrapped);
};

require("./specials-parentheses-entry");
