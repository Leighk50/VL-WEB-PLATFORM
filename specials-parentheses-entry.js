"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const http = require("http");
const formatSpecialsTitle = require("./specials-title");

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
  const key = String(value || "").trim().toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ");
  const aliases = {
    dairy:"dairy", milk:"dairy",
    egg:"eggs", eggs:"eggs", eg:"eggs", egs:"eggs",
    gluten:"gluten", wheat:"gluten", "cereal containing gluten":"gluten", "cereals containing gluten":"gluten",
    crustacean:"crustaceans", crustaceans:"crustaceans", crustation:"crustaceans", crustations:"crustaceans",
    fish:"fish", lupin:"lupin",
    mollusc:"molluscs", molluscs:"molluscs", mollusk:"molluscs", mollusks:"molluscs",
    mustard:"mustard",
    nut:"nuts", nuts:"nuts", almond:"nuts", almonds:"nuts", cashew:"nuts", cashews:"nuts", hazelnut:"nuts", hazelnuts:"nuts", walnut:"nuts", walnuts:"nuts",
    peanut:"peanuts", peanuts:"peanuts",
    sesame:"sesame",
    soy:"soya", soya:"soya",
    celery:"celery",
    sulphite:"sulphites", sulphites:"sulphites", sulfite:"sulphites", sulfites:"sulphites"
  };
  if (aliases[key]) return aliases[key];
  // Allergen lists arrive with frequent typing errors. Match a close spelling
  // only against known aliases, so ordinary description words are never
  // silently turned into allergens.
  const distance = (a, b) => {
    const row = Array.from({length:b.length + 1}, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let previous = row[0]; row[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const saved = row[j];
        row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
        previous = saved;
      }
    }
    return row[b.length];
  };
  let closest = "", score = Infinity;
  for (const alias of Object.keys(aliases).filter(x => !x.includes(" "))) {
    const next = distance(key, alias);
    if (next < score) { closest = alias; score = next; }
  }
  const allowance = key.length >= 8 ? 2 : key.length >= 4 ? 1 : 0;
  return score <= allowance ? aliases[closest] : "";
}

function formatAllergens(tokens) {
  const expanded = tokens.flatMap(token => {
    const raw = String(token || "").trim();
    if (normalizeAllergenToken(raw)) return [raw];
    return raw.split(/\s+(?:and\s+)?|\s*&\s*/i).filter(Boolean);
  });
  const seen = new Set(expanded.map(normalizeAllergenToken).filter(Boolean));
  return [...seen].map(x => x.charAt(0).toUpperCase() + x.slice(1)).join(", ");
}

function extractBracketAllergens(line) {
  let source = String(line || "").trim();
  const groups = [...source.matchAll(/\(([^()]*)\)/g)];
  if (!groups.length) return {line:source, allergens:""};
  const candidate = groups[groups.length - 1];
  const tokens = candidate[1].split(/[,;/]+/).map(x => x.trim()).filter(Boolean);
  if (!tokens.length) return {line:source, allergens:""};
  const recognisedCount = tokens.map(normalizeAllergenToken).filter(Boolean).length;
  if (recognisedCount < Math.max(1, Math.ceil(tokens.length * 0.6))) return {line:source, allergens:""};
  source = `${source.slice(0, candidate.index)}${source.slice(candidate.index + candidate[0].length)}`.replace(/\s{2,}/g, " ").trim();
  return {line:source, allergens:formatAllergens(tokens)};
}

function cleanText(value) {
  const cleaned = String(value || "").trim().replace(/\s+/g, " ").replace(/\s+,/g, ",").replace(/,\s*/g, ", ")
    .replace(/\bcafe de paris\b/gi, "Café de Paris")
    .replace(/\bmoules frit(?:s|es)?\b/gi, "Moules frites")
    .replace(/\bGraint\s+Argentina(n)?\s+(prawn|shrimp)s?\b/gi, m => /shrimp/i.test(m) ? "Giant Argentinian shrimp" : "Giant Argentinian prawns")
    .replace(/\bArgentina(n)?\s+(prawn|shrimp)s?\b/gi, m => /shrimp/i.test(m) ? "Argentinian shrimp" : "Argentinian prawns");
  return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : "";
}

function cleanSentence(value) {
  const cleaned = cleanText(value);
  return cleaned && !/[.!?]$/.test(cleaned) ? `${cleaned}.` : cleaned;
}

function warningList(item) {
  const text = `${item.name} ${item.description}`.toLowerCase();
  const all = String(item.allergens || "").toLowerCase();
  const warnings = [];
  const check = (ingredient, allergen) => { if (text.includes(ingredient) && !all.includes(allergen)) warnings.push(`Possible ${allergen} allergen because the dish mentions ${ingredient}. Confirm before publishing.`); };
  check("cream", "dairy"); check("butter", "dairy"); check("cheese", "dairy");
  check("prawn", "crustaceans"); check("shrimp", "crustaceans"); check("mussel", "molluscs");
  check("salmon", "fish"); check("mackerel", "fish"); check("cod", "fish");
  check("bread", "gluten"); check("flatbread", "gluten"); check("sourdough", "gluten");
  check("almond", "nuts"); check("cashew", "nuts"); check("white wine", "sulphites");
  if (!item.allergens) warnings.push("Allergens are required before publishing.");
  if (!/^£\d+(?:\.\d{1,2})?$/.test(String(item.price || "").trim())) warnings.push("Price needs review before publishing.");
  return [...new Set(warnings)];
}

function rulesParse(text) {
  const lines = String(text || "").split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const sections = [];
  let current = null, lastItem = null, activeItems = [];
  for (const raw of lines) {
    let line = raw.replace(/^[-*•]+\s*/, "");
    if (/^specials?$/i.test(line)) continue;
    if (/^(starters?|mains?|main courses?|desserts?|dessert|to share|sides?)\s*:?\s*$/i.test(line)) {
      const label = line.replace(/:$/, "").trim().replace(/^main courses?$/i, "Mains").replace(/^dessert$/i, "Desserts");
      current = {name:cleanText(label), items:[]}; sections.push(current); lastItem = null; activeItems = []; continue;
    }
    if (/^allergens?\s*:/i.test(line)) {
      const allergens = formatAllergens(line.replace(/^allergens?\s*:/i, "").split(/[,;/]+/));
      for (const item of activeItems.length ? activeItems : (lastItem ? [lastItem] : [])) item.allergens = allergens;
      continue;
    }
    // Chefs often put allergens on the line immediately after the dish:
    //   Fish special £18
    //   (fish, dairy, egg, sulphites)
    // Treat a bracket-only recognised allergen line as belonging to the
    // previous dish instead of accidentally creating a new blank dish.
    if (/^\([^()]+\)$/.test(line) && lastItem) {
      const standalone = extractBracketAllergens(line);
      if (standalone.allergens) {
        for (const item of activeItems.length ? activeItems : [lastItem]) item.allergens = standalone.allergens;
        continue;
      }
    }
    const bracket = extractBracketAllergens(line);
    line = bracket.line;
    const numericPrice = line.match(/(?:£|GBP\s*)(\d+(?:\.\d{1,2})?)/i);
    const nonNumericPrice = !numericPrice && /£\s*\D/.test(line) ? line.match(/£\s*([^()]+)$/i) : null;
    if (bracket.allergens && !numericPrice && !nonNumericPrice && activeItems.length) {
      for (const item of activeItems) {
        if (line) item.description = cleanSentence([item.description, line].filter(Boolean).join(", "));
        item.allergens = bracket.allergens;
      }
      continue;
    }
    const looksLikeDish = Boolean(numericPrice || nonNumericPrice || bracket.allergens);
    if (looksLikeDish) {
      if (!current) { current = {name:"Today’s Specials", items:[]}; sections.push(current); }
      let body = line;
      let price = "";
      let priceNote = "";
      if (numericPrice) {
        body = line.replace(numericPrice[0], "").trim();
        price = `£${Number(numericPrice[1]).toFixed(Number(numericPrice[1]) % 1 ? 2 : 0)}`;
      } else if (nonNumericPrice) {
        priceNote = nonNumericPrice[1].trim();
        body = line.replace(nonNumericPrice[0], "").trim();
      }
      body = body.trim().replace(/[\s,;:\-–—]+$/g, "");
      const parts = body.split(/,\s*/);
      const item = {
        id:`sp-${crypto.randomBytes(5).toString("hex")}`,
        name:formatSpecialsTitle(cleanText(parts.shift() || body)),
        description:cleanSentence(parts.join(", ")),
        price,
        allergens:bracket.allergens,
        visible:true,
        warnings:[]
      };
      if (priceNote) item.description = cleanSentence([item.description.replace(/[.!?]$/, ""), `Chef price note: ${priceNote}`].filter(Boolean).join(", "));
      current.items.push(item);
      // Consecutive price-only headings are variants of one special. The
      // description/allergens that follow belong to every heading, while each
      // heading keeps its own name and price.
      if (activeItems.length && activeItems.every(x => !x.description && !x.allergens)) activeItems.push(item);
      else activeItems = [item];
      lastItem = item; continue;
    }
    if (lastItem) {
      for (const item of activeItems.length ? activeItems : [lastItem]) item.description = cleanSentence([item.description.replace(/[.!?]$/, ""), line].filter(Boolean).join(", "));
    }
  }
  for (const section of sections) for (const item of section.items) item.warnings = warningList(item);
  return sections.filter(s => s.items.length);
}

async function aiParse(text) {
  if (!AI_KEY || !AI_MODEL) return null;
  const prompt = `Parse this UK restaurant specials text into JSON. Proofread ALL visible text: correct spelling, grammar, punctuation, capitalisation and obvious culinary terminology while preserving the intended meaning. Use title case for dish headings, leaving short joining words such as and, of, with and de in lower case. Every sentence must start with a capital letter. The first priced line is a dish heading. If two or more priced heading lines appear consecutively before one description, create a separate item for every heading, retain each heading's own price, and copy the shared description and allergens to every item. Inspect every word inside parentheses as a possible allergen, correct misspellings, and standardise to only these display names: Celery, Gluten, Crustaceans, Eggs, Fish, Lupin, Dairy, Molluscs, Mustard, Nuts, Peanuts, Sesame, Soya, Sulphites. Always convert Milk to Dairy. Do not leave an allergen parenthesis in the description. Also support a separate Allergens: line. Infer an allergen only when the supplied word is clearly that allergen despite a spelling error; otherwise add a warning rather than guessing. Correct examples such as crustation -> Crustaceans and Graint Argentina shrimp -> Giant Argentinian shrimp. If a price is missing or written as text such as '£free samples price up to you', return an empty price and retain the note for admin review. Never invent a numeric price. Return only JSON: {"sections":[{"name":"Starters","items":[{"name":"...","description":"...","price":"£12","allergens":"Dairy, Crustaceans","warnings":[]}]}]}. Input:\n${text}`;
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
      item.name = formatSpecialsTitle(cleanText(item.name));
      item.description = cleanSentence(item.description);
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
