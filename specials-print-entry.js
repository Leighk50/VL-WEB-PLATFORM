"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const http = require("http");

const USER = process.env.ADMIN_USERNAME || "admin";
const SECRET = process.env.SESSION_SECRET || "replace-this-secret";
const DATA_DIR = process.env.CONTENT_DATA_DIR || (process.env.HOME ? path.join(process.env.HOME, "site", "data") : path.join(__dirname, "data"));
const DRAFT_FILE = path.join(DATA_DIR, "specials-draft.json");

function sign(value){return crypto.createHmac("sha256",SECRET).update(value).digest("hex")}
function validAdmin(req){
  let token="";
  const auth=req.headers.authorization||"";
  if(auth.startsWith("Bearer ")) token=auth.slice(7);
  if(!token){const cookie=(req.headers.cookie||"").split(";").map(x=>x.trim()).find(x=>x.startsWith("vl_admin="));token=cookie?decodeURIComponent(cookie.slice(9)):""}
  if(!token.includes(".")) return false;
  const [encoded,signature]=token.split(".");
  let raw="";try{raw=Buffer.from(encoded,"base64url").toString()}catch{return false}
  const expected=sign(raw);
  if(signature.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(signature),Buffer.from(expected))) return false;
  const [user,expires]=raw.split("|");
  return user===USER&&Number(expires)>Date.now();
}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]))}
function readDraft(){try{return JSON.parse(fs.readFileSync(DRAFT_FILE,"utf8"))}catch{return null}}
function printPage(draft){
  const sections=(draft?.sections||[]).map(s=>`<section><h2>${esc(s.name)}</h2>${(s.items||[]).map(i=>`<article><div class="dish"><h3>${esc(i.name)}</h3><strong>${esc(i.price)}</strong></div>${i.description?`<p>${esc(i.description)}</p>`:""}<small>${esc(i.allergens)}</small></article>`).join("")}</section>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Village Limits Specials</title><style>@page{size:A4;margin:14mm}*{box-sizing:border-box}body{font-family:Georgia,serif;color:#1e1e1e;margin:0}main{max-width:760px;margin:auto;border:1px solid #bbb;padding:28px 38px;min-height:260mm}header{text-align:center;border-bottom:2px solid #333;padding-bottom:16px;margin-bottom:22px}header img{max-width:165px;max-height:65px;object-fit:contain}h1{font-size:34px;letter-spacing:2px;margin:8px 0}header p{font-family:Arial,sans-serif;letter-spacing:3px;text-transform:uppercase;font-size:11px}h2{text-align:center;text-transform:uppercase;letter-spacing:2px;font-size:18px;margin:25px 0 12px}.dish{display:flex;justify-content:space-between;gap:20px;align-items:baseline}.dish h3{font-size:16px;margin:10px 0 3px}.dish strong{white-space:nowrap}article p{margin:0 0 4px;font-style:italic;font-size:14px}small{font-family:Arial,sans-serif;font-size:10px;color:#555}footer{text-align:center;margin-top:28px;font:11px Arial,sans-serif}.screen{margin:12px;text-align:center}@media print{.screen{display:none}}</style></head><body><div class="screen"><button onclick="window.print()">Print Specials Menu</button></div><main><header><img src="/assets/images/logo-gold.png" alt="Village Limits"><p>Woodhall Spa</p><h1>TODAY’S SPECIALS</h1><p>Something a little special from our kitchen</p></header>${sections}<footer>Please speak to a member of the team about allergies or dietary requirements before ordering.</footer></main></body></html>`;
}

const originalCreateServer=http.createServer;
http.createServer=function printCreateServer(options,requestListener){
  const listener=typeof options==="function"?options:requestListener;
  const serverOptions=typeof options==="function"?undefined:options;
  const wrapped=(req,res)=>{
    const url=new URL(req.url,`http://${req.headers.host||"localhost"}`);
    if(req.method==="GET"&&url.pathname==="/admin/specials/print"){
      if(!validAdmin(req)){res.writeHead(302,{Location:"/admin"});res.end();return}
      res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"});
      res.end(printPage(readDraft()));return;
    }
    return listener(req,res);
  };
  return serverOptions===undefined?originalCreateServer.call(http,wrapped):originalCreateServer.call(http,serverOptions,wrapped);
};

require("./specials-sms-safe");
