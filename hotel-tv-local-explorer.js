'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const CATEGORIES=['heritage','museums','attractions','walks','nature','family','events'];
const blocked=/\b(restaurant|pub|pubs|cafe|cafes|café|cafés|bar|bars|takeaway|takeaways|hotel|hotels|guesthouse|accommodation|breakfast|brunch|dinner|dining|afternoon tea|food festival)\b/i;
function safeUrl(value){const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port||u.hostname==='localhost'||!u.hostname.includes('.')||/^(\d+\.){3}\d+$/.test(u.hostname))throw Error('Use a public HTTPS destination.');return u.href;}
function clean(raw){
 if(!raw||!CATEGORIES.includes(raw.category))throw Error('Choose an allowed Local Explorer category.');
 const out={};
 for(const [key,max] of [['id',80],['title',120],['area',120],['venue',160],['description',900]]){if(typeof raw[key]!=='string'||raw[key].length>max)throw Error('Invalid '+key);out[key]=raw[key].trim();}
 if(!/^[a-z0-9-]+$/.test(out.id)||!out.title||!out.description)throw Error('Enter an ID, title and description.');
 out.category=raw.category;out.url=safeUrl(raw.url);out.sourceUrl=safeUrl(raw.sourceUrl);out.sourceName=new URL(out.sourceUrl).hostname.replace(/^www\./,'')==='wowlincs.co.uk'?'Discovered through WOW Lincs':'';
 if(blocked.test([out.title,out.venue,out.description,out.url].join(' '))||raw.competitorVenue===true||raw.foodLed===true)throw Error('Food, drink and competing accommodation promotions are excluded.');
 out.status=raw.status==='approved'?'approved':'draft';
 out.reviewedNonCompeting=raw.reviewedNonCompeting===true;
 if(out.status==='approved'&&!out.reviewedNonCompeting)throw Error('Confirm the venue and destination contain no competing promotion before approving.');
 if(out.status==='approved'&&new URL(out.url).hostname.replace(/^www\./,'')==='wowlincs.co.uk'&&(/^\/$/.test(new URL(out.url).pathname)||/eat-and-drink|eat-drink|restaurants|pubs|cafes|stays/i.test(new URL(out.url).pathname)))throw Error('Choose a specific non-competing visitor page, not a general directory.');
 out.startsAt=null;out.endsAt=null;
 if(out.category==='events'){
  for(const key of ['startsAt','endsAt']){if(typeof raw[key]!=='string'||!/T.*(?:Z|[+-]\d\d:\d\d)$/.test(raw[key])||!Number.isFinite(Date.parse(raw[key])))throw Error('Events require start and end times with a timezone.');out[key]=new Date(raw[key]).toISOString();}
  if(Date.parse(out.endsAt)<=Date.parse(out.startsAt))throw Error('Event end must follow its start.');
 }
 // Images are optional and never imported from discovery sites automatically.
 out.image='';out.imageAlt='';out.imageCredit='';out.imageRightsConfirmed=raw.imageRightsConfirmed===true;
 if(raw.image){if(!raw.imageRightsConfirmed||typeof raw.imageCredit!=='string'||!raw.imageCredit.trim())throw Error('Confirm image usage rights and credit.');out.image=safeUrl(raw.image);out.imageCredit=raw.imageCredit.trim().slice(0,200);out.imageAlt=String(raw.imageAlt||out.title).slice(0,160);}
 return out;
}
function createExplorer(store=require('./hotel-tv-storage')){
 const filename='tv-local-explorer.json';
 function read(){try{return JSON.parse(fs.readFileSync(path.join(store.dir,filename),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;return {version:1,items:require('./hotel-tv-local-explorer-seed.json')};}}
 function revision(state){return '"'+crypto.createHash('sha256').update(JSON.stringify(state)).digest('hex')+'"';}
 function save(items){if(!Array.isArray(items)||items.length>100)throw Error('Add up to 100 places or events.');const next={version:1,items:items.map(clean)};if(new Set(next.items.map(i=>i.id)).size!==next.items.length)throw Error('IDs must be unique.');store.write(filename,next);return next;}
 function published(now=new Date()){return read().items.map(clean).filter(i=>i.status==='approved'&&(i.category!=='events'||Date.parse(i.endsAt)>now.getTime())).map(({status,reviewedNonCompeting,sourceUrl,...item})=>{const original=require('./hotel-tv-attractions.json').find(a=>a.url===item.url);const qr=require('./hotel-tv-local-explorer-qr.json')[item.url];return original?{...item,qr:original.qr}:qr?{...item,qr}:item;});}
 return {read,save,revision,published};
}
module.exports={createExplorer,clean,CATEGORIES};
