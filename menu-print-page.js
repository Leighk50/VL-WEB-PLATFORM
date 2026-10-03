"use strict";
const formatSpecialsTitle = require("./specials-title");
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const MONTHS = ["january","february","march","april","may","june","july","august","september","october","november","december"];
function upcomingEvents(events, now = new Date()) {
  const today = new Intl.DateTimeFormat("en-CA", {timeZone:"Europe/London",year:"numeric",month:"2-digit",day:"2-digit"}).format(now);
  return (events || []).filter(event => event.visible === true).map(event => {
    let date = event.startDate ? new Date(event.startDate) : null;
    if (!date || Number.isNaN(date.getTime())) {
      const match = String(event.date || "").match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\s+(\d{4})\b/i);
      if (!match) return null;
      const month = MONTHS.indexOf(match[2].toLowerCase());
      if (month < 0) return null;
      date = new Date(Date.UTC(Number(match[3]),month,Number(match[1]),12));
      if (date.getUTCMonth() !== month || date.getUTCDate() !== Number(match[1])) return null;
    }
    const day = new Intl.DateTimeFormat("en-CA", {timeZone:"Europe/London",year:"numeric",month:"2-digit",day:"2-digit"}).format(date);
    if (day < today) return null;
    const label = new Intl.DateTimeFormat("en-GB", {timeZone:"Europe/London",weekday:"short",day:"numeric",month:"short",year:"numeric"}).format(date);
    return {title:event.title, date:label, sort:date.getTime()};
  }).filter(Boolean).sort((a,b)=>a.sort-b.sort).slice(0,3);
}
function printMenuPage(menu, events = [], now = new Date()) {
  const upcoming = upcomingEvents(events, now);
  const eventsList = upcoming.length ? `<ul class="upcoming-events">${upcoming.map(event=>`<li><strong>${esc(event.title)}</strong><span>${esc(event.date)}</span></li>`).join("")}</ul>` : '<p class="events-empty">Discover our latest events and entertainment online.</p>';
  const sections = (menu.sections || []).map(section => {
    const items = (section.items || []).filter(item => item.visible !== false);
    if (!items.length) return "";
    return `<section class="menu-section"><div class="section-title"><span></span><h2>${esc(section.name)}</h2><span></span></div><div class="section-items">${items.map(item => `<article class="menu-item"><div class="dish-row"><h3>${esc(menu.id === "specials" ? formatSpecialsTitle(item.name) : item.name)}</h3><div class="dots"></div><strong>${esc(item.price)}</strong></div>${item.description ? `<p class="description">${esc(item.description)}</p>` : ""}${item.allergens ? `<p class="allergens"><span>Allergens</span> ${esc(item.allergens)}</p>` : ""}</article>`).join("")}</div></section>`;
  }).join("");
  const compact = menu.id === "main" || menu.id === "sunday";
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${esc(menu.name)} | Village Limits</title><style>
@page{size:A4;margin:10mm}
*{box-sizing:border-box}
:root{--ink:#272622;--muted:#68645e;--gold:#b69a67;--gold-dark:#80643a;--cream:#f6f0e6;--paper:#fffefa}
html,body{margin:0;padding:0;background:#ece7df;color:var(--ink)}
body{font-family:Georgia,"Times New Roman",serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.screen{padding:14px;text-align:center;font-family:Arial,sans-serif}
.screen button{border:0;border-radius:999px;background:#2d2924;color:#fff;padding:11px 20px;font-weight:700;cursor:pointer}
.menu-sheet{position:relative;max-width:794px;min-height:1115px;margin:0 auto;background:var(--paper);padding:20px 18px 22px;box-shadow:0 8px 28px rgba(0,0,0,.12);overflow:hidden}
header{position:relative;z-index:1;text-align:center;padding:4px 20px 20px}
header img{display:block;margin:0 auto 10px;width:285px;max-width:100%;height:auto;max-height:145px;object-fit:contain}
.location{font-family:Arial,sans-serif;text-transform:uppercase;letter-spacing:3.5px;font-size:9px;color:var(--gold-dark);margin:0 0 10px}
h1{font-size:36px;line-height:1.08;letter-spacing:3.3px;margin:0;color:var(--ink);font-weight:normal;text-transform:uppercase}
.subtitle{font-size:12px;font-style:italic;line-height:1.35;margin:8px 0 0;color:var(--muted)}
.gold-rule{display:flex;align-items:center;gap:12px;justify-content:center;margin:14px auto 0;max-width:420px}.gold-rule span{height:1px;background:linear-gradient(90deg,transparent,var(--gold),transparent);flex:1}.gold-rule b{color:var(--gold);font-size:12px;font-weight:normal}
.menu-section{position:relative;z-index:1;margin:17px 8px 0;break-inside:avoid}
.section-title{display:flex;align-items:center;gap:14px;margin:0 0 8px}.section-title span{height:1px;flex:1;background:linear-gradient(90deg,transparent,var(--gold))}.section-title span:last-child{background:linear-gradient(90deg,var(--gold),transparent)}
h2{margin:0;font-family:Georgia,"Times New Roman",serif;font-size:15px;font-weight:normal;letter-spacing:2.8px;text-transform:uppercase;color:var(--gold-dark);white-space:nowrap}
.menu-item{padding:8px 3px 8px;border-bottom:1px solid rgba(128,100,58,.16);break-inside:avoid}.menu-item:last-child{border-bottom:0}
.dish-row{display:flex;align-items:baseline;gap:8px}.dish-row h3{margin:0;font-size:16px;font-weight:700;line-height:1.25;letter-spacing:.1px}.dots{flex:1;border-bottom:1px dotted rgba(128,100,58,.38);transform:translateY(-3px)}.dish-row strong{font-family:Arial,sans-serif;font-size:13px;font-variant-numeric:tabular-nums;color:var(--gold-dark);white-space:nowrap}
.description{margin:3px 0 0;font-size:13px;line-height:1.35;color:#514e49;font-style:italic}.allergens{margin:4px 0 0;font-family:Arial,sans-serif;font-size:9.5px;line-height:1.35;color:#766d64;text-transform:none}.allergens span{font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:#5d544b;margin-right:4px}
footer{position:relative;z-index:1;margin:24px 24px 0;padding-top:12px;border-top:1px solid rgba(182,148,82,.4);text-align:center;font-family:Arial,sans-serif;color:#6f655c;font-size:9.5px;line-height:1.45;letter-spacing:.15px;break-inside:avoid}
.footer-brand{display:block;margin-top:5px;text-transform:uppercase;letter-spacing:2px;color:var(--gold-dark);font-size:9px}
.footer-promotions{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:8px;break-inside:avoid;text-align:left}
.footer-social{display:flex;justify-content:flex-start;align-items:center;gap:9px;color:var(--muted);font-size:9px;letter-spacing:.15px;break-inside:avoid;min-width:0}
.footer-social img{display:block;width:76px;height:76px;flex:none;padding:2px;background:#fff;border:1px solid rgba(182,148,82,.4)}
.footer-social strong{font-weight:600;color:var(--gold-dark)}
.footer-social a{color:var(--gold-dark);text-decoration:none}
.two-column .menu-sheet{padding:14px 16px 18px}
.two-column header{padding:0 16px 8px}
.two-column header img{width:160px;max-height:105px;margin-bottom:4px}
.two-column h1{font-size:26px;letter-spacing:2.5px}
.two-column .subtitle{font-size:10px;line-height:1.3;margin-top:5px}
.two-column .gold-rule{margin-top:7px}
.two-column .menu-section{margin:9px 6px 0}
.two-column .section-title{margin-bottom:3px}
.two-column .section-items{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:24px;align-items:start}
.two-column .menu-item{padding:4px 2px 4px}
.two-column h2{font-size:13px;letter-spacing:2.3px}
.two-column .dish-row h3{font-size:12px;line-height:1.2}
.two-column .dish-row strong{font-size:10.5px}
.two-column .description{font-size:10.3px;line-height:1.23;margin-top:2px}
.two-column .allergens{font-size:8px;line-height:1.18;margin-top:2px}
.two-column footer{margin:10px 15px 0;padding-top:5px;font-size:8px}
.two-column .footer-social{margin-top:4px;font-size:7.5px;gap:6px}
.two-column .footer-social img{width:76px;height:76px}
.upcoming-events{list-style:none;padding:0;margin:4px 0}
.upcoming-events li{margin:0 0 3px;line-height:1.25}
.upcoming-events li strong,.upcoming-events li span{display:block}
.events-empty{margin:4px 0}
.footer-events{border-left:1px solid rgba(182,148,82,.4);padding-left:12px}
footer a{overflow-wrap:anywhere}
@media print{.two-column .menu-sheet{padding:8px 6px 10px}.two-column header img{width:115px;max-height:75px}.two-column header{padding-bottom:5px}.two-column .location{margin-bottom:5px}.two-column .menu-item{padding:3px 2px}.two-column .description{font-size:10px}.two-column .allergens{font-size:7.5px}.two-column .menu-section{margin-top:6px}html,body{background:#fff}.screen{display:none}.menu-sheet{box-shadow:none;margin:0;min-height:auto;max-width:none;width:100%;padding:14px 8px 16px}header{padding-left:0;padding-right:0}header img{max-width:100%}}
</style></head><body class="${compact ? "two-column" : ""}">
<div class="screen"><button type="button" onclick="window.print()">Print ${esc(menu.name)}</button></div>
<main class="menu-sheet">
<header><img src="/assets/images/logo-gold.png" alt="Village Limits"><p class="location">Woodhall Spa</p><h1>${esc(menu.name)}</h1>${menu.description ? `<p class="subtitle">${esc(menu.description)}</p>` : ""}<div class="gold-rule"><span></span><b>◆</b><span></span></div></header>
${sections || '<p style="text-align:center">No dishes have been added yet.</p>'}
<footer>Please speak to a member of the team about allergies or dietary requirements before ordering.<span class="footer-brand">Village Limits · Stixwould Road · Woodhall Spa</span><div class="footer-promotions"><div class="footer-social"><img src="/assets/images/keep-in-touch-qr.svg" alt="QR code for Keep in Touch"><span><strong>Keep in touch</strong> · Be first to hear about offers, menus and events.<br>Scan the code or visit <a href="https://villagelimits.co.uk/keep-in-touch">villagelimits.co.uk/keep-in-touch</a></span></div><div class="footer-social footer-events"><img src="/assets/images/whats-on-qr.svg" alt="QR code for upcoming Village Limits events"><div><strong>Coming up at Village Limits</strong>${eventsList}<a href="https://www.villagelimits.co.uk/whats-on">villagelimits.co.uk/whats-on</a><br>Scan for details and booking.</div></div></div></footer></main></body></html>`;
}
module.exports = {printMenuPage, upcomingEvents};
