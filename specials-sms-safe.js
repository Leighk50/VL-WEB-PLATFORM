"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const http = require("http");
const formatSpecialsTitle = require("./specials-title");

const USER = process.env.ADMIN_USERNAME || "admin";
const SECRET = process.env.SESSION_SECRET || "replace-this-secret";
const DATA_DIR = process.env.CONTENT_DATA_DIR || (process.env.HOME ? path.join(process.env.HOME, "site", "data") : path.join(__dirname, "data"));
const CONTENT_FILE = path.join(DATA_DIR, "content.json");
const DRAFT_FILE = path.join(DATA_DIR, "specials-draft.json");
const WEBHOOK_SECRET = process.env.CHEF_SMS_WEBHOOK_SECRET || "";
const AI_KEY = process.env.OPENAI_API_KEY || "";
const AI_MODEL = process.env.SPECIALS_AI_MODEL || "";
const AI_URL = process.env.SPECIALS_AI_API_URL || "https://api.openai.com/v1/chat/completions";

function normalizePhone(value) {
  let phone = String(value || "").trim().replace(/[\s()-]/g, "");
  if (phone.startsWith("0044")) phone = "+44" + phone.slice(4);
  else if (phone.startsWith("0")) phone = "+44" + phone.slice(1);
  else if (/^44\d+$/.test(phone)) phone = "+" + phone;
  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : "";
}

const CHEF_NUMBERS = new Set(
  String(process.env.CHEF_SMS_NUMBERS || "")
    .split(",")
    .map(normalizePhone)
    .filter(Boolean)
);

function sign(value) {
  return crypto.createHmac("sha256", SECRET).update(value).digest("hex");
}

function validAdmin(req) {
  const auth = req.headers.authorization || "";
  let token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) {
    const cookie = (req.headers.cookie || "").split(";").map(x => x.trim()).find(x => x.startsWith("vl_admin="));
    token = cookie ? decodeURIComponent(cookie.slice(9)) : "";
  }
  if (!token.includes(".")) return false;
  const [encoded, signature] = token.split(".");
  let raw = "";
  try { raw = Buffer.from(encoded, "base64url").toString(); } catch { return false; }
  const expected = sign(raw);
  if (signature.length !== expected.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false;
  const [user, expires] = raw.split("|");
  return user === USER && Number(expires) > Date.now();
}

function json(res, status, payload) {
  res.writeHead(status, {"Content-Type":"application/json; charset=utf-8", "Cache-Control":"no-store", "X-Content-Type-Options":"nosniff"});
  res.end(JSON.stringify(payload));
}

function ensureDir() { fs.mkdirSync(DATA_DIR, {recursive:true}); }
function readDraft() { try { return JSON.parse(fs.readFileSync(DRAFT_FILE, "utf8")); } catch { return null; } }
function writeDraft(draft) {
  ensureDir();
  const temp = DRAFT_FILE + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(draft, null, 2), {encoding:"utf8", mode:0o600});
  fs.renameSync(temp, DRAFT_FILE);
  try { fs.chmodSync(DRAFT_FILE, 0o600); } catch {}
  return draft;
}
function readContent() { return JSON.parse(fs.readFileSync(CONTENT_FILE, "utf8").replace(/^\uFEFF/, "")); }
function writeContent(content) {
  const temp = CONTENT_FILE + ".specials.tmp";
  fs.writeFileSync(temp, JSON.stringify(content, null, 2), "utf8");
  fs.renameSync(temp, CONTENT_FILE);
}

function readRaw(req, max=100000) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", chunk => { raw += chunk; if (raw.length > max) reject(new Error("Request too large")); });
    req.on("end", () => resolve(raw));
    req.on("error", reject);
  });
}

function parseBody(raw, contentType) {
  if (!raw) return {};
  if (String(contentType || "").includes("application/json")) {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  return Object.fromEntries(new URLSearchParams(raw).entries());
}

function cleanText(value) {
  const cleaned = String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s+,/g, ",")
    .replace(/,\s*/g, ", ")
    .replace(/\bc[oô]te\s+de\s+b(?:ou?f|oeuf|œuf)\b/gi, "Côte de bœuf")
    .replace(/\bcafe de paris\b/gi, "Café de Paris")
    .replace(/\bmoules frit(?:s|es)?\b/gi, "Moules frites")
    .replace(/\bArgentina(n)?\s+(prawn|shrimp)s?\b/gi, m => /shrimp/i.test(m) ? "Argentinian shrimp" : "Argentinian prawns");
  return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : "";
}

function cleanSentence(value) {
  const cleaned = cleanText(value);
  return cleaned && !/[.!?]$/.test(cleaned) ? `${cleaned}.` : cleaned;
}

function normalizeAllergens(value) {
  const map = {milk:"dairy", dairy:"dairy", egg:"eggs", eggs:"eggs", eg:"eggs", egs:"eggs", gluten:"gluten", "cereal containing gluten":"gluten", "cereals containing gluten":"gluten", wheat:"gluten", crustacean:"crustaceans", crustation:"crustaceans", crustations:"crustaceans", soy:"soya", sulphite:"sulphites", sulfite:"sulphites", sulfites:"sulphites", nut:"nuts", mollusc:"molluscs", mollusk:"molluscs"};
  const seen = new Set();
  for (const raw of String(value || "").split(/[,;/]+/)) {
    const key = raw.trim().toLowerCase();
    if (!key) continue;
    seen.add(map[key] || key);
  }
  return [...seen].map(x => x.charAt(0).toUpperCase() + x.slice(1)).join(", ");
}

function warningsFor(item) {
  const text = `${item.name} ${item.description}`.toLowerCase();
  const allergens = String(item.allergens || "").toLowerCase();
  const warnings = [];
  const check = (ingredient, allergen) => {
    if (text.includes(ingredient) && !allergens.includes(allergen)) warnings.push(`Possible ${allergen} allergen because the dish mentions ${ingredient}. Confirm before publishing.`);
  };
  check("cream", "dairy"); check("butter", "dairy"); check("cheese", "dairy");
  check("prawn", "crustaceans"); check("shrimp", "crustaceans"); check("mussel", "molluscs");
  check("salmon", "fish"); check("mackerel", "fish"); check("cod", "fish");
  check("bread", "gluten"); check("flatbread", "gluten"); check("sourdough", "gluten");
  check("almond", "nuts"); check("cashew", "nuts"); check("white wine", "sulphites");
  if (!item.allergens) warnings.push("Allergens are required before publishing.");
  return warnings;
}

function rulesParse(text) {
  const lines = String(text || "").split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const sections = [];
  let current = null;
  let lastItem = null;
  for (const raw of lines) {
    const line = raw.replace(/^[-*•]+\s*/, "");
    if (/^specials?$/i.test(line)) continue;
    if (/^(starters?|mains?|main courses?|desserts?|dessert|to share|sides?)\s*:?$/i.test(line)) {
      const label = line.replace(/:$/, "").replace(/^main courses?$/i, "Mains").replace(/^dessert$/i, "Desserts");
      current = {name:label, items:[]}; sections.push(current); lastItem = null; continue;
    }
    if (/^allergens?\s*:/i.test(line)) {
      if (lastItem) lastItem.allergens = normalizeAllergens(line.replace(/^allergens?\s*:/i, ""));
      continue;
    }
    const price = line.match(/(?:£|GBP\s*)(\d+(?:\.\d{1,2})?)/i);
    if (price) {
      if (!current) { current = {name:"Today’s Specials", items:[]}; sections.push(current); }
      const body = line.replace(price[0], "").trim();
      const parts = body.split(/,\s*/);
      const item = {
        id:`sp-${crypto.randomBytes(5).toString("hex")}`,
        name:cleanText(parts.shift() || body),
        description:cleanText(parts.join(", ")),
        price:`£${Number(price[1]).toFixed(Number(price[1]) % 1 ? 2 : 0)}`,
        allergens:"",
        visible:true,
        warnings:[]
      };
      current.items.push(item); lastItem = item; continue;
    }
    if (lastItem) lastItem.description = cleanText([lastItem.description, line].filter(Boolean).join(", "));
  }
  for (const section of sections) for (const item of section.items) item.warnings = warningsFor(item);
  return sections.filter(s => s.items.length);
}

async function aiParse(text) {
  if (!AI_KEY || !AI_MODEL) return null;
  const prompt = `Parse this UK restaurant specials text into JSON. Correct only obvious spelling, punctuation and culinary terminology. Standardise supplied allergen wording. Never invent allergens. Put uncertain allergen issues in warnings. Preserve supplied prices. Return only JSON: {"sections":[{"name":"Starters","items":[{"name":"...","description":"...","price":"£12","allergens":"Milk, Crustaceans","warnings":[]}]}]}. Input:\n${text}`;
  const response = await fetch(AI_URL, {method:"POST", headers:{Authorization:`Bearer ${AI_KEY}`, "Content-Type":"application/json"}, body:JSON.stringify({model:AI_MODEL, messages:[{role:"system", content:"Return valid JSON only."},{role:"user", content:prompt}], temperature:0})});
  if (!response.ok) throw new Error(`AI parser returned ${response.status}`);
  const data = await response.json();
  const raw = data?.choices?.[0]?.message?.content;
  if (!raw) throw new Error("AI parser returned no content");
  const parsed = JSON.parse(String(raw).replace(/^```json\s*|\s*```$/g, ""));
  if (!Array.isArray(parsed.sections)) throw new Error("AI parser returned invalid sections");
  for (const section of parsed.sections) {
    section.name = cleanText(section.name || "Specials");
    section.items = Array.isArray(section.items) ? section.items : [];
    for (const item of section.items) {
      item.id = `sp-${crypto.randomBytes(5).toString("hex")}`;
      item.name = cleanText(item.name);
      item.description = cleanSentence(item.description);
      item.price = String(item.price || "").trim();
      item.allergens = normalizeAllergens(item.allergens);
      item.visible = true;
      item.warnings = [...(Array.isArray(item.warnings) ? item.warnings.map(String) : []), ...warningsFor(item)];
    }
  }
  return parsed.sections.filter(s => s.items.length);
}

async function parseSpecials(text) {
  try {
    const sections = await aiParse(text);
    if (sections?.length) return {sections, parser:"ai"};
  } catch (err) { console.warn("Chef specials AI fallback:", err.message); }
  return {sections:rulesParse(text), parser:"rules"};
}

function validateForPublish(sections) {
  if (!Array.isArray(sections) || !sections.length) throw new Error("No specials were found.");
  for (const section of sections) {
    if (!section.name || !Array.isArray(section.items) || !section.items.length) throw new Error("Every section needs a name and at least one dish.");
    for (const item of section.items) {
      if (!item.name) throw new Error("Every dish needs a name.");
      if (!/^£\d+(?:\.\d{1,2})?$/.test(String(item.price || ""))) throw new Error(`${item.name} needs a valid £ price.`);
      if (!String(item.allergens || "").trim()) throw new Error(`${item.name}: allergens are required.`);
      if (Array.isArray(item.warnings) && item.warnings.length) throw new Error(`${item.name}: allergen warnings must be reviewed first.`);
    }
  }
}

function publish(sections) {
  validateForPublish(sections);
  const content = readContent();
  const menu = {id:"specials", name:"Specials", description:"Current limited-availability dishes.", visible:true, status:"Published from chef SMS", updatedAt:new Date().toISOString(), sections:sections.map(s => ({name:cleanText(s.name), items:s.items.map(i => ({id:i.id || crypto.randomUUID(), name:formatSpecialsTitle(cleanText(i.name)), description:cleanSentence(i.description), price:String(i.price), allergens:normalizeAllergens(i.allergens), visible:i.visible !== false}))}))};
  const index = (content.menus || []).findIndex(m => m.id === "specials");
  if (index >= 0) content.menus[index] = menu; else (content.menus || (content.menus = [])).push(menu);
  writeContent(content);
  return menu;
}

function webhookAllowed(req) {
  if (!WEBHOOK_SECRET) return true;
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  return url.searchParams.get("secret") === WEBHOOK_SECRET || req.headers["x-vl-webhook-secret"] === WEBHOOK_SECRET || req.headers["x-webhook-secret"] === WEBHOOK_SECRET;
}

function extractInbound(payload) {
  return {
    from:normalizePhone(payload.from || payload.originator || payload.source || payload.mobile || payload.phone || payload.msisdn || payload.sender),
    text:String(payload.message_body || payload.message || payload.text || payload.body || payload.sms || "").trim()
  };
}

async function handle(req, res, pathname) {
  if (pathname === "/api/webhooks/webex/inbound-sms" && req.method === "POST") {
    if (!webhookAllowed(req)) { json(res, 403, {error:"Invalid webhook secret"}); return true; }
    const payload = parseBody(await readRaw(req), req.headers["content-type"]);
    const {from, text} = extractInbound(payload);
    if (!from || !CHEF_NUMBERS.has(from)) { json(res, 202, {ok:true, ignored:true}); return true; }
    if (!/^specials\b/i.test(text)) { json(res, 202, {ok:true, ignored:true, reason:"Message did not start with Specials"}); return true; }
    const parsed = await parseSpecials(text);
    const draft = writeDraft({id:crypto.randomUUID(), receivedAt:new Date().toISOString(), from, sourceText:text, status:"draft", parser:parsed.parser, sections:parsed.sections});
    json(res, 200, {ok:true, draftId:draft.id, parser:draft.parser}); return true;
  }

  if (!pathname.startsWith("/api/admin/specials-sms")) return false;
  if (!validAdmin(req)) { json(res, 401, {error:"Your admin session has expired."}); return true; }

  if (pathname === "/api/admin/specials-sms/status" && req.method === "GET") { json(res, 200, {configuredChefNumbers:CHEF_NUMBERS.size, webhookSecretConfigured:Boolean(WEBHOOK_SECRET), aiConfigured:Boolean(AI_KEY && AI_MODEL)}); return true; }
  if (pathname === "/api/admin/specials-sms/draft" && req.method === "GET") { json(res, 200, {draft:readDraft()}); return true; }
  if (pathname === "/api/admin/specials-sms/parse" && req.method === "POST") {
    const body = parseBody(await readRaw(req), req.headers["content-type"]);
    const text = String(body.text || "").trim();
    const parsed = await parseSpecials(text);
    const draft = writeDraft({id:crypto.randomUUID(), receivedAt:new Date().toISOString(), from:"admin", sourceText:text, status:"draft", parser:parsed.parser, sections:parsed.sections});
    json(res, 200, {draft}); return true;
  }
  if (pathname === "/api/admin/specials-sms/draft" && req.method === "PUT") {
    const body = parseBody(await readRaw(req), req.headers["content-type"]);
    const draft = readDraft() || {id:crypto.randomUUID(), receivedAt:new Date().toISOString(), from:"admin", status:"draft", sourceText:""};
    draft.sections = body.sections || draft.sections || [];
    draft.status = "draft";
    writeDraft(draft); json(res, 200, {draft}); return true;
  }
  if (pathname === "/api/admin/specials-sms/publish" && req.method === "POST") {
    const draft = readDraft();
    if (!draft) throw new Error("No specials draft found.");
    const menu = publish(draft.sections);
    draft.status = "published"; draft.publishedAt = new Date().toISOString(); writeDraft(draft);
    json(res, 200, {ok:true, menu}); return true;
  }
  return false;
}

const originalCreateServer = http.createServer;
http.createServer = function specialsCreateServer(options, requestListener) {
  const listener = typeof options === "function" ? options : requestListener;
  const serverOptions = typeof options === "function" ? undefined : options;
  const wrapped = async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      if (await handle(req, res, decodeURIComponent(url.pathname))) return;
      return listener(req, res);
    } catch (err) {
      if (!res.headersSent) json(res, 400, {error:err.message || "Chef specials request failed"});
      else res.end();
    }
  };
  return serverOptions === undefined ? originalCreateServer.call(http, wrapped) : originalCreateServer.call(http, serverOptions, wrapped);
};

require("./seo-enhancements");
