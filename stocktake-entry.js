"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const http = require("http");

const OWNER = process.env.ADMIN_USERNAME || "admin";
const SECRET = process.env.SESSION_SECRET || "replace-this-secret";
const DATA_DIR = process.env.CONTENT_DATA_DIR || (process.env.HOME ? path.join(process.env.HOME, "site", "data") : path.join(__dirname, "data"));
const USERS_FILE = path.join(DATA_DIR, "admin-users.json");
const STOCK_FILE = path.join(DATA_DIR, "bar-stocktake.json");
const TYPES = ["Soft Drink", "Lager", "Spirits", "Bottled Lager", "Wine", "Champagne"];
const LOCATIONS = [
  {id:"bar", label:"Bar"},
  {id:"cellar", label:"Cellar"},
  {id:"walk_in_fridge", label:"Walk-in Fridge"}
];

function json(res,status,value){res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});res.end(JSON.stringify(value));}
function safeEqual(a,b){const aa=Buffer.from(String(a)),bb=Buffer.from(String(b));return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb);}
function sign(raw){return crypto.createHmac("sha256",SECRET).update(raw).digest("hex");}
function tokenFromReq(req){const auth=req.headers.authorization||"";if(auth.startsWith("Bearer "))return auth.slice(7);const cookie=(req.headers.cookie||"").split(";").map(x=>x.trim()).find(x=>x.startsWith("vl_admin="));return cookie?decodeURIComponent(cookie.slice(9)):"";}
function decodeToken(req){const token=tokenFromReq(req);if(!token.includes("."))return null;const [encoded,signature]=token.split(".");let raw="";try{raw=Buffer.from(encoded,"base64url").toString();}catch{return null;}if(!safeEqual(signature,sign(raw)))return null;const [ownerName,expires,effectiveUser]=raw.split("|");if(ownerName!==OWNER||!Number(expires)||Number(expires)<=Date.now())return null;return effectiveUser||OWNER;}
function readUsers(){try{const data=JSON.parse(fs.readFileSync(USERS_FILE,"utf8"));return Array.isArray(data.users)?data.users:[];}catch{return[];}}
function canStocktake(req){const username=decodeToken(req);if(!username)return false;if(username===OWNER)return true;const user=readUsers().find(u=>String(u.username).toLowerCase()===String(username).toLowerCase());return Boolean(user&&user.enabled!==false&&Array.isArray(user.permissions)&&user.permissions.includes("stocktake"));}
function sameOrigin(req){const origin=req.headers.origin;if(!origin)return true;try{return new URL(origin).host===req.headers.host;}catch{return false;}}
function readRaw(req,max=1000000){return new Promise((resolve,reject)=>{let raw="";req.on("data",c=>{raw+=c;if(raw.length>max)reject(new Error("Request too large"));});req.on("end",()=>resolve(raw));req.on("error",reject);});}
function payload(raw){try{return raw?JSON.parse(raw):{};}catch{return{};}}
function ensureDir(){fs.mkdirSync(DATA_DIR,{recursive:true});}
function emptyStock(){return {version:1,updatedAt:null,items:[],counts:{}};}
function readStock(){ensureDir();try{const data=JSON.parse(fs.readFileSync(STOCK_FILE,"utf8"));return {version:1,updatedAt:data.updatedAt||null,items:Array.isArray(data.items)?data.items:[],counts:data.counts&&typeof data.counts==="object"?data.counts:{}};}catch{return emptyStock();}}
function writeStock(data){ensureDir();const temp=STOCK_FILE+".tmp";fs.writeFileSync(temp,JSON.stringify(data,null,2),{encoding:"utf8",mode:0o600});fs.renameSync(temp,STOCK_FILE);try{fs.chmodSync(STOCK_FILE,0o600);}catch{}}
function cleanText(v){return String(v||"").trim().replace(/\s+/g," ");}
function norm(v){return cleanText(v).toLowerCase().replace(/[^a-z0-9]+/g," ").trim();}
function itemKey(description,size){return `${norm(description)}|${norm(size)}`;}
function scoreItem(item,q){const n=norm(q);if(!n)return 0;const hay=norm(`${item.description} ${item.size} ${item.type}`);if(hay===n)return 100;if(hay.startsWith(n))return 80;if(hay.includes(n))return 60;const words=n.split(" ").filter(Boolean);return words.reduce((s,w)=>s+(hay.includes(w)?10:0),0);}
function publicData(data){return {types:TYPES,locations:LOCATIONS,updatedAt:data.updatedAt,items:data.items.map(i=>({...i,total:Object.values(data.counts[i.id]||{}).reduce((a,b)=>a+(Number(b)||0),0),counts:{bar:Number(data.counts[i.id]?.bar)||0,cellar:Number(data.counts[i.id]?.cellar)||0,walk_in_fridge:Number(data.counts[i.id]?.walk_in_fridge)||0}}))};}

async function handle(req,res,pathname,url){
  if(!pathname.startsWith("/api/admin/stocktake"))return false;
  if(!canStocktake(req)){json(res,decodeToken(req)?403:401,{error:"Your account does not have access to Bar Stock Take."});return true;}
  if(["POST","PUT","DELETE"].includes(req.method)&&!sameOrigin(req)){json(res,403,{error:"Invalid request origin."});return true;}

  const data=readStock();
  if(pathname==="/api/admin/stocktake"&&req.method==="GET"){json(res,200,publicData(data));return true;}
  if(pathname==="/api/admin/stocktake/search"&&req.method==="GET"){
    const q=String(url.searchParams.get("q")||"");
    const results=data.items.map(item=>({item,score:scoreItem(item,q)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,8).map(x=>x.item);
    json(res,200,{results});return true;
  }
  if(pathname==="/api/admin/stocktake/items"&&req.method==="POST"){
    const body=payload(await readRaw(req));
    const type=cleanText(body.type),description=cleanText(body.description),size=cleanText(body.size);
    if(!TYPES.includes(type)){json(res,400,{error:"Please choose a valid item type."});return true;}
    if(description.length<2){json(res,400,{error:"Please enter the product description."});return true;}
    if(!size){json(res,400,{error:"Please enter the bottle, can, keg or pack size."});return true;}
    const key=itemKey(description,size);
    const duplicate=data.items.find(i=>itemKey(i.description,i.size)===key);
    if(duplicate){json(res,409,{error:"That product is already in the master list.",existing:duplicate});return true;}
    const suggestions=data.items.map(item=>({item,score:scoreItem(item,`${description} ${size}`)})).filter(x=>x.score>=40).sort((a,b)=>b.score-a.score).slice(0,5).map(x=>x.item);
    if(suggestions.length&&!body.confirmNew){json(res,409,{error:"Similar products already exist. Select one of them, or confirm this is genuinely a new product.",suggestions});return true;}
    const now=new Date().toISOString();
    const item={id:crypto.randomUUID(),type,description,size,createdAt:now,updatedAt:now};
    data.items.push(item);data.counts[item.id]={bar:0,cellar:0,walk_in_fridge:0};data.updatedAt=now;writeStock(data);json(res,201,{ok:true,item});return true;
  }
  if(pathname.startsWith("/api/admin/stocktake/items/")&&req.method==="PUT"){
    const id=decodeURIComponent(pathname.slice("/api/admin/stocktake/items/".length));const item=data.items.find(i=>i.id===id);if(!item){json(res,404,{error:"Stock item not found."});return true;}
    const body=payload(await readRaw(req));const type=cleanText(body.type),description=cleanText(body.description),size=cleanText(body.size);
    if(!TYPES.includes(type)||!description||!size){json(res,400,{error:"Type, description and size are required."});return true;}
    const key=itemKey(description,size);if(data.items.some(i=>i.id!==id&&itemKey(i.description,i.size)===key)){json(res,409,{error:"Another master item already uses that description and size."});return true;}
    Object.assign(item,{type,description,size,updatedAt:new Date().toISOString()});data.updatedAt=item.updatedAt;writeStock(data);json(res,200,{ok:true,item});return true;
  }
  if(pathname==="/api/admin/stocktake/counts"&&req.method==="PUT"){
    const body=payload(await readRaw(req));const entries=Array.isArray(body.entries)?body.entries:[];
    for(const entry of entries){const id=String(entry.id||"");if(!data.items.some(i=>i.id===id))continue;const next={};for(const loc of LOCATIONS){const value=Number(entry[loc.id]);next[loc.id]=Number.isFinite(value)&&value>=0?value:0;}data.counts[id]=next;}
    data.updatedAt=new Date().toISOString();writeStock(data);json(res,200,{ok:true,updatedAt:data.updatedAt});return true;
  }
  json(res,405,{error:"Method not allowed."});return true;
}

const originalCreateServer=http.createServer;
http.createServer=function stocktakeCreateServer(options,requestListener){
  const listener=typeof options==="function"?options:requestListener;
  const serverOptions=typeof options==="function"?undefined:options;
  const wrapped=async(req,res)=>{try{const url=new URL(req.url,`http://${req.headers.host||"localhost"}`);if(await handle(req,res,decodeURIComponent(url.pathname),url))return;return listener(req,res);}catch(err){console.error("Stocktake error",err);if(!res.headersSent)json(res,500,{error:"Stock take request failed."});else res.end();}};
  return serverOptions===undefined?originalCreateServer.call(http,wrapped):originalCreateServer.call(http,serverOptions,wrapped);
};

require("./admin-rbac-entry");
