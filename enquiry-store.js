"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const DATA_DIR = process.env.CONTENT_DATA_DIR || (process.env.HOME ? path.join(process.env.HOME, "site", "data") : path.join(__dirname, "data"));
const ENQUIRIES_FILE = path.join(DATA_DIR, "enquiries.json");

function readEnquiries() {
  try {
    const value = JSON.parse(fs.readFileSync(ENQUIRIES_FILE, "utf8"));
    if (!Array.isArray(value)) throw new Error("Enquiry records have an invalid format.");
    return value;
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
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

function saveSubmittedEnquiry(type, body) {
  const items = readEnquiries();
  const record = createEnquiry(type, body);
  record.deliveryStatus = "pending";
  items.unshift(record);
  writeEnquiries(items.slice(0, 2000));
  return async status => {
    const current = readEnquiries();
    const item = current.find(entry => entry.id === record.id);
    if (!item) throw new Error("Enquiry record is missing.");
    item.deliveryStatus = status;
    writeEnquiries(current);
  };
}

module.exports = {readEnquiries, writeEnquiries, saveSubmittedEnquiry};
