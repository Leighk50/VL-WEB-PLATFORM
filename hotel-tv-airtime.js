'use strict';
const SOURCE='https://airtime.cloud/10/Movie-Catalogue',TTL=6*60*60*1000;
let cache=null,pending=null,retryAfter=0;
function parsePosters(html){
 const start=html.indexOf('Now Available on Airtime');if(start<0)throw Error('Airtime featured section unavailable');
 const end=html.indexOf('View Our Full Movie Catalogue',start);if(end<0)throw Error('Airtime featured section incomplete');
 const images=[...html.slice(start,end).matchAll(/<img\b[^>]*\bsrc=['"]([^'"]+)['"]/gi)].map(m=>m[1].replace(/&amp;/g,'&')).filter(p=>/^\/cache\/img\/380\/pg\|\d+&/.test(p));
 const posters=[...new Set(images)].slice(0,18).map((p,i)=>({id:String(i+1),image:new URL(p,SOURCE).href,alt:'Featured film poster from Airtime'}));
 if(!posters.length)throw Error('Airtime posters unavailable');return posters;
}
async function refresh(){const r=await fetch(SOURCE,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Airtime HTTP '+r.status);const decoder=new TextDecoder();let html='',size=0;for await(const chunk of r.body){size+=chunk.length;if(size>1000000)throw Error('Airtime page too large');html+=decoder.decode(chunk,{stream:true});}html+=decoder.decode();cache={posters:parsePosters(html),updatedAt:new Date().toISOString()};}
function airtime(now=new Date()){
 if((!cache||now.getTime()-Date.parse(cache.updatedAt)>=TTL)&&now.getTime()>=retryAfter&&!pending)pending=refresh().catch(()=>{retryAfter=Date.now()+10*60*1000;}).finally(()=>{pending=null;});
 const fresh=cache&&now.getTime()-Date.parse(cache.updatedAt)<TTL;return {sourceUrl:SOURCE,updatedAt:fresh?cache.updatedAt:null,posters:fresh?cache.posters:[]};
}
module.exports={airtime,parsePosters};
