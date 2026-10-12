'use strict';
const attractions=require('./hotel-tv-attractions.json');
const SOURCE='https://thekinemainthewoods.co.uk/KinemaInTheWoods.dll/Home';
const HOUR=60*60*1000;
let cached=null,pending=null,retryAfter=0;
function ukDate(date){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);}
function text(html){return html.replace(/<[^>]*>/g,'').replace(/&#(x[\da-f]+|\d+);/gi,(_,n)=>String.fromCodePoint(n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n))).replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&nbsp;/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim();}
function parseListings(html){
 const films=new Map(),performances=new Map();
 for(const m of html.matchAll(/<option\b[^>]*value="Film(\d+)"[^>]*>([\s\S]*?)<\/option>/gi))films.set(m[1],text(m[2]));
 for(const m of html.matchAll(/<option\b[^>]*class="Film(\d+)\s+Day(\d{8})"[^>]*>([\s\S]*?)<\/option>/gi)){
  const title=films.get(m[1]),time=text(m[3]).match(/@\s*(\d{1,2}):(\d{2})\s*(am|pm)\b/i);if(!title||!time)continue;
  const h=Number(time[1]),minute=Number(time[2]);if(h<1||h>12||minute>59)continue;
  const date=m[2].slice(0,4)+'-'+m[2].slice(4,6)+'-'+m[2].slice(6),hour=h%12+(time[3].toLowerCase()==='pm'?12:0),clock=String(hour).padStart(2,'0')+':'+time[2];
  performances.set(m[1]+'|'+date+'|'+clock,{id:m[1],title,date,time:clock});
 }
 if(!films.size||!performances.size)throw Error('Kinema listing format unavailable');
 return [...performances.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time)||a.title.localeCompare(b.title));
}
async function refresh(fetcher=fetch,now=new Date()){
 const response=await fetcher(SOURCE,{signal:AbortSignal.timeout(20000),headers:{'User-Agent':'VillageLimitsGuestGuide/1.0 (+https://www.villagelimits.co.uk)'}});
 if(!response.ok)throw Error('Kinema HTTP '+response.status);
 const decoder=new TextDecoder();let html='',bytes=0;for await(const chunk of response.body){bytes+=chunk.length;if(bytes>1500000)throw Error('Kinema page too large');html+=decoder.decode(chunk,{stream:true});}html+=decoder.decode();
 cached={items:parseListings(html),updatedAt:now.toISOString()};return cached;
}
function cinemaResult(cache,now){const today=ukDate(now),tomorrow=ukDate(new Date(now.getTime()+86400000));const fresh=cache&&now.getTime()-Date.parse(cache.updatedAt)<HOUR;return {status:fresh?'available':'unavailable',sourceUrl:SOURCE,updatedAt:fresh?cache.updatedAt:null,days:[today,tomorrow].map(date=>({date,films:fresh?Object.values(cache.items.filter(p=>p.date===date).reduce((out,p)=>{const key=p.id;if(!out[key])out[key]={id:p.id,title:p.title,times:[]};out[key].times.push(p.time);return out;},{})):[]}))};}
async function explore(now=new Date()){
 if((!cached||now.getTime()-Date.parse(cached.updatedAt)>=HOUR)&&now.getTime()>=retryAfter){if(!pending)pending=refresh(fetch,now).catch(()=>{retryAfter=Date.now()+10*60*1000;}).finally(()=>{pending=null;});/* Cinema refresh must not delay hotel content. */}
 return {attractions,cinema:cinemaResult(cached,now)};
}
module.exports={explore,parseListings,cinemaResult,ukDate};
