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
  const sections=(draft?.sections||[]).map(s=>`<section class="menu-section"><div class="section-title"><span></span><h2>${esc(s.name)}</h2><span></span></div>${(s.items||[]).map(i=>`<article class="menu-item"><div class="dish-row"><h3>${esc(formatSpecialsTitle(i.name))}</h3><div class="dots"></div><strong>${esc(i.price)}</strong></div>${i.description?`<p class="description">${esc(i.description)}</p>`:""}${i.allergens?`<p class="allergens"><span>Allergens</span> ${esc(i.allergens)}</p>`:""}</article>`).join("")}</section>`).join("");

  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Village Limits Specials</title>
<style>
@page{size:A4;margin:10mm}
*{box-sizing:border-box}
:root{--ink:#241f1a;--muted:#6c6258;--gold:#b69452;--gold-dark:#8a6d34;--cream:#f6f0e6;--paper:#fffdf8}
html,body{margin:0;padding:0;background:#ece7df;color:var(--ink)}
body{font-family:Georgia,"Times New Roman",serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.screen{padding:14px;text-align:center;font-family:Arial,sans-serif}
.screen button{border:0;border-radius:999px;background:#2d2924;color:#fff;padding:11px 20px;font-weight:700;cursor:pointer}
.menu-sheet{position:relative;max-width:794px;min-height:1115px;margin:0 auto;background:var(--paper);padding:30px 46px 34px;box-shadow:0 8px 28px rgba(0,0,0,.12);overflow:hidden}
.menu-sheet:before,.menu-sheet:after{content:"";position:absolute;pointer-events:none}
.menu-sheet:before{inset:14px;border:1px solid rgba(182,148,82,.62)}
.menu-sheet:after{inset:20px;border:1px solid rgba(182,148,82,.20)}
.corner{position:absolute;width:64px;height:64px;z-index:0;opacity:.72}
.corner:before,.corner:after{content:"";position:absolute;background:var(--gold)}
.corner:before{width:52px;height:1px;top:10px;left:0}.corner:after{width:1px;height:52px;left:10px;top:0}
.corner.tl{top:18px;left:18px}.corner.tr{top:18px;right:18px;transform:rotate(90deg)}.corner.bl{bottom:18px;left:18px;transform:rotate(270deg)}.corner.br{bottom:18px;right:18px;transform:rotate(180deg)}
header{position:relative;z-index:1;text-align:center;padding:4px 20px 24px}
header img{display:block;margin:0 auto 16px;width:600px;max-width:100%;height:auto;max-height:250px;object-fit:contain}
.location{font-family:Arial,sans-serif;text-transform:uppercase;letter-spacing:4px;font-size:10px;color:var(--gold-dark);margin:0 0 9px}
h1{font-size:38px;line-height:1;letter-spacing:3px;margin:0;color:var(--ink);font-weight:normal}
.subtitle{font-size:13px;font-style:italic;margin:9px 0 0;color:var(--muted)}
.gold-rule{display:flex;align-items:center;gap:12px;justify-content:center;margin:17px auto 0;max-width:420px}.gold-rule span{height:1px;background:linear-gradient(90deg,transparent,var(--gold),transparent);flex:1}.gold-rule b{color:var(--gold);font-size:15px;font-weight:normal}
.menu-section{position:relative;z-index:1;margin:18px 8px 0;break-inside:avoid}
.section-title{display:flex;align-items:center;gap:13px;margin:0 0 7px}.section-title span{height:1px;flex:1;background:linear-gradient(90deg,transparent,var(--gold))}.section-title span:last-child{background:linear-gradient(90deg,var(--gold),transparent)}
h2{margin:0;font-family:Arial,sans-serif;font-size:13px;letter-spacing:3.2px;text-transform:uppercase;color:var(--gold-dark);white-space:nowrap}
.menu-item{padding:8px 3px 7px;border-bottom:1px solid rgba(138,109,52,.12);break-inside:avoid}.menu-item:last-child{border-bottom:0}
.dish-row{display:flex;align-items:baseline;gap:8px}.dish-row h3{margin:0;font-size:16px;font-weight:700;line-height:1.25;letter-spacing:.15px}.dots{flex:1;border-bottom:1px dotted rgba(108,98,88,.55);transform:translateY(-3px)}.dish-row strong{font-family:Arial,sans-serif;font-size:14px;color:var(--gold-dark);white-space:nowrap}
.description{margin:3px 0 0;font-size:13.2px;line-height:1.35;color:#4f4841;font-style:italic}.allergens{margin:4px 0 0;font-family:Arial,sans-serif;font-size:9.5px;line-height:1.35;color:#766d64;text-transform:none}.allergens span{font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#5d544b;margin-right:4px}
footer{position:relative;z-index:1;margin:24px 24px 0;padding-top:12px;border-top:1px solid rgba(182,148,82,.4);text-align:center;font-family:Arial,sans-serif;color:#6f655c;font-size:9.5px;line-height:1.45;letter-spacing:.15px}
.footer-brand{display:block;margin-top:5px;text-transform:uppercase;letter-spacing:2px;color:var(--gold-dark);font-size:9px}
@media print{html,body{background:#fff}.screen{display:none}.menu-sheet{box-shadow:none;margin:0;min-height:auto;max-width:none;width:100%;padding:24px 40px 28px}.menu-sheet:before{inset:5px}.menu-sheet:after{inset:11px}.corner.tl{top:9px;left:9px}.corner.tr{top:9px;right:9px}.corner.bl{bottom:9px;left:9px}.corner.br{bottom:9px;right:9px}header{padding-left:0;padding-right:0}header img{width:600px;max-width:100%;max-height:245px}}
</style>
</head>
<body>
<div class="screen"><button onclick="window.print()">Print Specials Menu</button></div>
<main class="menu-sheet">
  <div class="corner tl"></div><div class="corner tr"></div><div class="corner bl"></div><div class="corner br"></div>
  <header>
    <img src="/assets/images/logo-gold.png" alt="Village Limits">
    <p class="location">Woodhall Spa</p>
    <h1>TODAY’S SPECIALS</h1>
    <p class="subtitle">Something a little special from our kitchen</p>
    <div class="gold-rule"><span></span><b>◆</b><span></span></div>
  </header>
  ${sections || '<p style="text-align:center">No specials have been added yet.</p>'}
  <footer>Please speak to a member of the team about allergies or dietary requirements before ordering.<span class="footer-brand">Village Limits · Stixwould Road · Woodhall Spa</span></footer>
</main>
</body>
</html>`;
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
