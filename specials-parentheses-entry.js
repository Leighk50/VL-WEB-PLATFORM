"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const http = require("http");

const USER = process.env.ADMIN_USERNAME || "admin";
const SECRET = process.env.SESSION_SECRET || "replace-this-secret";
const DATA_DIR = process.env.CONTENT_DATA_DIR || (process.env.HOME ? path.join(process.env.HOME, "site", "data") : path.join(__dirname, "data"));
const DRAFT_FILE = path.join(DATA_DIR, "specials-draft.json");
const WEBHOOK_SECRET = process.env.CHEF_SMS_WEBHOOK_SECRET || "";
const AI_KEY = process.env.OPENAI_API_KEY || "";
const AI_MODEL = process.env.SPECIALS_AI_MODEL || "";
const AI_URL = process.env.SPECIALS_AI_API_URL || "https://api.openai.com/v1/chat/completions";
const WEBHOOK_PATH = "/api/webhooks/webex/inbound-sms";
const ADMIN_PARSE_PATH = "/api/admin/specials-sms/parse";

function normalizePhone(value) {
  let phone = String(value || "").trim().replace(/[\s()-]/g, "");
  if (phone.startsWith("0044")) phone = "+44" + phone.slice(4);
  else if (phone.startsWith("0")) phone = "+44" + phone.slice(1);
  else if (/^44\d+$/.test(phone)) phone = "+" + phone;
  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : "";
}

const CHEF_NUMBERS = new Set(String(process.env.CHEF_SMS_NUMBERS || "").split(",").map(normalizePhone).filter(Boolean));

function sign(value) { return crypto.createHmac("sha256", SECRET).update(value).digest("hex"); }
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

function normalizeAllergenToken(value) {
  const key = String(value || "").trim().toLowerCase().replace(/\.$/, "");
  const aliases = {
    dairy:"milk", milk:"milk",
    egg:"eggs", eggs:"eggs",
    gluten:"cereals containing gluten", "cereal containing gluten":"cereals containing gluten", "cereals containing gluten":"cereals containing gluten",
    crustacean:"crustaceans", crustaceans:"crustaceans",
    fish:"fish", lupin:"lupin",
    mollusc:"molluscs", molluscs:"molluscs",
    mustard:"mustard",
    nut:"nuts", nuts:"nuts", almond:"nuts", almonds:"nuts", cashew:"nuts", cashews:"nuts", hazelnut:"nuts", hazelnuts:"nuts", walnut:"nuts", walnuts:"nuts",
    peanut:"peanuts", peanuts:"peanuts",
    sesame:"sesame",
    soy:"soya", soya:"soya",
    celery:"celery",
    sulphite:"sulphites", sulphites:"sulphites", sulfite:"sulphites", sulfites:"sulphites",
  };
  return aliases[key] || "";
}

function formatAllergens(tokens) {
  const seen = new Set(tokens.map(normalizeAllergenToken).filter(Boolean));
  return [...seen].map(x => x.charAt(0).toUpperCase() + x.slice(1)).join(", ");
}

function extractBracketAllergens(line) {
  let source = String(line || "").trim();
  const groups = [...source.matchAll(/\(([^()]*)\)/g)];
  if (!groups.length) return {line:source, allergens:""};
  const candidate = groups[groups.length - 1];
  const tokens = candidate[1].split(/[,;/]+/).map(x => x.trim()).filter(Boolean);
  if (!tokens.length || !tokens.every(token => Boolean(normalizeAllergenToken(token)))) return {line:source, allergens:""};
  source = `${source.slice(0, candidate.index)}${source.slice(candidate.index + candidate[0].length)}`.replace(/\s{2,}/g, " ").trim();
  return {line:source, allergens:formatAllergens(tokens)};
}

function cleanText(value) {
  return String(value || "").trim().replace(/\s+/g, " ").replace(/\s+,/g, ",").replace(/,\s*/g, ", ")
    .replace(/\bcafe de paris\b/gi, "Café de Paris")
    .replace(/\bmoules frit(?:s|es)?\b/gi, "Moules frites")
    .replace(/\bArgentina(n)?\s+(prawn|shrimp)s?\b/gi, m => /shrimp/i.test(m) ? "Argentinian shrimp" : "Argentinian prawns");
}

function warningList(item) {
  const text = `${item.name} ${item.description}`.toLowerCase();
  const all = String(item.allergens || "").toLowerCase();
  const warnings = [];
  const check = (ingredient, allergen) => { if (text.includes(ingredient) && !all.includes(allergen)) warnings.push(`Possible ${allergen} allergen because the dish mentions ${ingredient}. Confirm before publishing.`); };
  check("cream", "milk"); check("butter", "milk"); check("cheese", "milk");
  check("prawn", "crustaceans"); check("shrimp", "crustaceans"); check("mussel", "molluscs");
  check("salmon", "fish"); check("mackerel", "fish"); check("cod", "fish");
  check("bread", "gluten"); check("flatbread", "gluten"); check("sourdough", "gluten");
  check("almond", "nuts"); check("cashew", "nuts"); check("white wine", "sulphites");
  if (!item.allergens) warnings.push("Allergens are required before publishing.");
  return [...new Set(warnings)];
}

function rulesParse(text) {
  const lines = String(text || "").split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const sections = [];
  let current = null, lastItem = null;
  for (const raw of lines) {
    let line = raw.replace(/^[-*•]+\s*/, "");
    if (/^specials?$/i.test(line)) continue;
    if (/^(starters?|mains?|main courses?|desserts?|dessert|to share|sides?)\s*:?$/i.test(line)) {
      const label = line.replace(/:$/, "").replace(/^main courses?$/i, "Mains").replace(/^dessert$/i, "Desserts");
      current = {name:label, items:[]}; sections.push(current); lastItem = null; continue;
    }
    if (/^allergens?\s*:/i.test(line)) {
      if (lastItem) lastItem.allergens = formatAllergens(line.replace(/^allergens?\s*:/i, "").split(/[,;/]+/));
      continue;
    }
    const bracket = extractBracketAllergens(line);
    line = bracket.line;
    const price = line.match(/(?:£|GBP\s*)(\d+(?:\.\d{1,2})?)/i);
    if (price) {
      if (!current) { current = {name:"Today’s Specials", items:[]}; sections.push(current); }
      const body = line.replace(price[0], "").trim().replace(/[\s,;:\-–—]+$/g, "");
      const parts = body.split(/,\s*/);
      const item = {
        id:`sp-${crypto.randomBytes(5).toString("hex")}`,
        name:cleanText(parts.shift() || body),
        description:cleanText(parts.join(", ")),
        price:`£${Number(price[1]).toFixed(Number(price[1]) % 1 ? 2 : 0)}`,
        allergens:bracket.allergens,
        visible:true,
        warnings:[]
      };
      current.items.push(item); lastItem = item; continue;
    }
    if (lastItem) lastItem.description = cleanText([lastItem.description, line].filter(Boolean).join(", "));
  }
  for (const section of sections) for (const item of section.items) item.warnings = warningList(item);
  return sections.filter(s => s.items.length);
}

async function aiParse(text) {
  if (!AI_KEY || !AI_MODEL) return null;
  const prompt = `Parse this UK restaurant specials text into JSON. The chef normally puts the allergen declaration in parentheses at the end of each dish, for example: Pan-fried prawns, Café de Paris butter, lemon, flatbread £12 (milk, gluten, crustaceans). Treat a parenthetical group made up of recognised UK allergens as the allergens field and do not leave that group in the dish description. Also support a separate 'Allergens:' line. Correct only obvious spelling, punctuation and culinary terminology. Standardise supplied allergen wording. Never invent allergens. Put uncertain allergen issues in warnings. Preserve supplied prices. Return only JSON: {"sections":[{"name":"Starters","items":[{"name":"...","description":"...","price":"£12","allergens":"Milk, Crustaceans","warnings":[]}]}]}. Input:\n${text}`;
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
      item.description = cleanText(item.description);
      item.price = String(item.price || "").trim();
      item.allergens = formatAllergens(String(item.allergens || "").split(/[,;/]+/));
      item.visible = true;
      item.warnings = [...new Set([...(Array.isArray(item.warnings) ? item.warnings.map(String) : []), ...warningList(item)])];
    }
  }
  return parsed.sections.filter(s => s.items.length);
}

async function parseSpecials(text) {
  try { const sections = await aiParse(text); if (sections?.length) return {sections, parser:"ai"}; }
  catch (err) { console.warn("Chef specials AI fallback:", err.message); }
  return {sections:rulesParse(text), parser:"rules"};
}

function writeDraft(draft) {
  fs.mkdirSync(DATA_DIR, {recursive:true});
  const temp = DRAFT_FILE + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(draft, null, 2), {encoding:"utf8", mode:0o600});
  fs.renameSync(temp, DRAFT_FILE);
  try { fs.chmodSync(DRAFT_FILE, 0o600); } catch {}
}

function webhookAllowed(req) {
  if (!WEBHOOK_SECRET) return true;
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  return url.searchParams.get("secret") === WEBHOOK_SECRET || req.headers["x-vl-webhook-secret"] === WEBHOOK_SECRET || req.headers["x-webhook-secret"] === WEBHOOK_SECRET;
}

async function parseAndSave(text, from) {
  if (!String(text || "").trim()) throw new Error("No specials text was supplied.");
  const parsed = await parseSpecials(text);
  const draft = {id:crypto.randomUUID(), receivedAt:new Date().toISOString(), from, sourceText:text, status:"draft", parser:parsed.parser, sections:parsed.sections};
  writeDraft(draft);
  return draft;
}

const originalCreateServer = http.createServer;
http.createServer = function parenthesesCreateServer(options, requestListener) {
  const listener = typeof options === "function" ? options : requestListener;
  const serverOptions = typeof options === "function" ? undefined : options;
  const wrapped = async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const pathname = decodeURIComponent(url.pathname);
    try {
      if (pathname === WEBHOOK_PATH && req.method === "POST") {
        if (!webhookAllowed(req)) { json(res, 403, {error:"Invalid webhook secret"}); return; }
        const payload = parseBody(await readRaw(req), req.headers["content-type"]);
        const data = payload && typeof payload.data === "object" ? payload.data : payload;
        const from = normalizePhone(data.phone_number || data.from || data.sender || data.msisdn);
        const text = String(data.message || data.message_body || data.text || "").trim();
        if (!from || !CHEF_NUMBERS.has(from)) { json(res, 202, {ok:true, ignored:true}); return; }
        if (!/^specials\b/i.test(text)) { json(res, 202, {ok:true, ignored:true, reason:"Message did not start with Specials"}); return; }
        const draft = await parseAndSave(text, from);
        json(res, 200, {ok:true, draftId:draft.id, parser:draft.parser});
        return;
      }

      if (pathname === ADMIN_PARSE_PATH && req.method === "POST") {
        if (!validAdmin(req)) { json(res, 401, {error:"Your admin session has expired."}); return; }
        const body = parseBody(await readRaw(req), req.headers["content-type"]);
        const draft = await parseAndSave(String(body.text || "").trim(), "admin");
        json(res, 200, {draft});
        return;
      }
    } catch (err) {
      json(res, 400, {error:err.message || "Chef specials parsing failed"});
      return;
    }
    return listener(req, res);
  };
  return serverOptions === undefined ? originalCreateServer.call(http, wrapped) : originalCreateServer.call(http, serverOptions, wrapped);
};

require("./webex-inbound-adapter");
