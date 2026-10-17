'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {dir,write}=require('./hotel-tv-storage');
function read(file,fallback){try{return JSON.parse(fs.readFileSync(path.join(dir,file),'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}}
function ukParts(date){return Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));}
function today(now){const p=ukParts(now);return p.year+'-'+p.month+'-'+p.day;}
function validDate(s){return typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;}
function checkoutTime(day){const d=new Date(day+'T12:00:00Z'),weekend=[0,6].includes(d.getUTCDay()),base=new Date(day+'T'+(weekend?'11':'10')+':00:00Z'),p=ukParts(base),local=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute);return new Date(base.getTime()-(local-base.getTime())).toISOString();}
function cleanArrivals(items){if(!Array.isArray(items)||items.length>1000)throw Error('Invalid booking import.');return items.map(r=>{if(!r||!Number.isInteger(r.room)||r.room<1||r.room>6||!validDate(r.checkin)||!validDate(r.checkout)||r.checkout<=r.checkin)throw Error('Invalid booking dates or room.');const first=String(r.first||'').trim(),last=String(r.last||'').trim();if(!first||!last||first.length>80||last.length>100||/[\x00-\x1f<>]/.test(first+last))throw Error('Invalid guest name.');return {room:r.room,first,last,checkin:r.checkin,checkout:r.checkout};});}
function activeWelcome(items,room,now=new Date()){
 const day=today(now),time=now.getTime();
 // Arrival-day welcomes start after the outgoing checkout cutoff, never at midnight.
 const matches=items.filter(r=>r.room===room&&Date.parse(checkoutTime(r.checkin))<=time&&Date.parse(checkoutTime(r.checkout))>time);
 if(matches.length!==1)return null;
 const r=matches[0],expiresAt=checkoutTime(r.checkout),isCheckoutDay=r.checkout===day;
 const weekend=[0,6].includes(new Date(r.checkout+'T12:00:00Z').getUTCDay()),checkoutLabel=weekend?'11am':'10am';
 return {name:r.first+' '+r.last,expiresAt,isCheckoutDay,checkoutLabel,checkoutMessage:isCheckoutDay?'Thank you for staying at The Village Limits. Checkout today is by '+checkoutLabel+'. When you are ready to check out, please leave your keys in your room and close the door behind you.':''};
}
async function payload(req){let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>256000)throw Error('Import too large.');}return JSON.parse(text);}
function hash(token){return crypto.createHash('sha256').update(token).digest('hex');}
function devices(){return read('tv-devices.json',[]).filter(d=>d.approved||Date.now()-Date.parse(d.created)<86400000);}
function deviceList(){return devices().map(d=>({id:d.id,room:d.room,code:d.id.slice(0,8).toUpperCase(),approved:d.approved,created:d.created}));}
function json(res,status,value,extra={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra});res.end(JSON.stringify(value));}
async function handleGuestTv(req,res,p,identity,enabled){
 const register=p==='/api/tv/device-register',welcome=p.match(/^\/api\/tv\/rooms\/([1-6])\/welcome$/),volumeAdmin=p==='/api/admin/tv/volume-test',volumeResult=p.match(/^\/api\/tv\/rooms\/(1)\/volume-result$/),admin=p==='/api/admin/tv/devices'||volumeAdmin,arrivals=p==='/api/admin/guest-sms/tv-arrivals';if(!register&&!welcome&&!volumeResult&&!admin&&!arrivals)return false;
 const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type, X-TV-Token','Access-Control-Allow-Methods':register||volumeResult?'POST, OPTIONS':'GET, OPTIONS'};
 if((register||welcome||volumeResult)&&req.method==='OPTIONS'){res.writeHead(204,cors);res.end();return true;}
 if(admin||arrivals){if(!identity){json(res,401,{error:'Please sign in.'});return true;}if(!identity.isOwner&&!identity.permissions.includes(admin?'settings':'guest_sms')){json(res,403,{error:'Permission required.'});return true;}if(req.method!=='GET'&&req.headers.origin){try{if(new URL(req.headers.origin).host!==req.headers.host)throw Error();}catch{json(res,403,{error:'Invalid request origin.'});return true;}}}
 try{
  if(arrivals&&req.method==='POST'){const b=await payload(req),items=cleanArrivals(b.items);const cancelled=Array.isArray(b.cancelled)?b.cancelled.filter(r=>r&&Number.isInteger(r.room)&&r.room>=1&&r.room<=6&&validDate(r.checkin)):[];const key=r=>r.room+'|'+r.checkin,person=r=>r.first+'|'+r.last+'|'+r.checkin+'|'+r.checkout;const replaced=new Set(items.map(key)),moved=new Set(items.map(person)),removed=new Set(cancelled.map(key));const retained=read('tv-arrivals.json',{items:[]}).items.filter(r=>Date.parse(checkoutTime(r.checkout))>Date.now()&&!replaced.has(key(r))&&!moved.has(person(r))&&!removed.has(key(r)));const combined=retained.concat(items.filter(r=>Date.parse(checkoutTime(r.checkout))>Date.now()&&!removed.has(key(r))));write('tv-arrivals.json',{updatedAt:new Date().toISOString(),items:combined});json(res,200,{ok:true,count:items.length});return true;}
  if(volumeAdmin){
   const saved=read('tv-volume-test.json',{});
   if(req.method==='GET'){json(res,200,saved);return true;}
   if(req.method!=='POST'){json(res,405,{error:'Method not allowed.'});return true;}
   const b=await payload(req);if(b.room!==1||b.volume!==22)throw Error('Pilot is limited to Room 1, volume 22.');
   const command={id:crypto.randomUUID(),room:1,volume:22,expiresAt:new Date(Date.now()+600000).toISOString()};write('tv-volume-test.json',{command,result:null});json(res,200,{command,result:null});return true;
  }
  if(admin&&req.method==='GET'){json(res,200,{devices:deviceList()});return true;}
  if(admin&&req.method==='POST'){const b=await payload(req),list=devices(),device=list.find(d=>d.id===b.id);if(!device){json(res,404,{error:'TV request not found.'});return true;}if(b.action==='approve')device.approved=true;else if(b.action==='revoke')device.approved=false;else throw Error('Invalid action.');write('tv-devices.json',list);json(res,200,{ok:true,devices:deviceList()});return true;}
  if(register&&req.method==='POST'){const b=await payload(req);if(!/^[a-f0-9]{64}$/.test(b.token||'')||!Number.isInteger(b.room)||b.room<1||b.room>6)throw Error('Invalid TV request.');const id=hash(b.token),list=devices();let d=list.find(d=>d.id===id);if(!d){if(list.length>=100||list.filter(d=>d.room===b.room&&!d.approved).length>=12){json(res,429,{error:'Too many pending TV requests.'},cors);return true;}d={id,room:b.room,approved:false,created:new Date().toISOString()};list.push(d);}if(d.room!==b.room){d.room=b.room;d.approved=false;d.created=new Date().toISOString();}write('tv-devices.json',list);json(res,200,{approved:d.approved,code:id.slice(0,8).toUpperCase()},cors);return true;}
  if((welcome&&req.method==='GET')||(volumeResult&&req.method==='POST')){const token=req.headers['x-tv-token'];if(!/^[a-f0-9]{64}$/.test(token||'')){json(res,403,{welcome:null},cors);return true;}const room=Number((welcome||volumeResult)[1]),d=devices().find(d=>d.id===hash(token)&&d.approved&&d.room===room);if(!d||!enabled(room)){json(res,403,{welcome:null},cors);return true;}const test=read('tv-volume-test.json',{});
   if(volumeResult){const b=await payload(req);if(!test.command||b.id!==test.command.id||Date.parse(test.command.expiresAt)<Date.now())throw Error('Volume test expired or replaced.');
    const number=v=>Number.isInteger(v)&&v>=0&&v<=100?v:null;
    const result={id:b.id,before:number(b.before),after:number(b.after),error:typeof b.error==='string'?b.error.slice(0,200):'',methods:Array.isArray(b.methods)?b.methods.filter(x=>typeof x==='string'&&/^[a-zA-Z0-9_.]{1,100}$/.test(x)).slice(0,60):[],receivedAt:new Date().toISOString()};write('tv-volume-test.json',{...test,result});json(res,200,{ok:true},cors);return true;}
   const saved=read('tv-arrivals.json',{items:[]});const live=saved.items.filter(r=>Date.parse(checkoutTime(r.checkout))>Date.now());if(live.length!==saved.items.length)write('tv-arrivals.json',{...saved,items:live});json(res,200,{welcome:activeWelcome(live,room),volumeTest:room===1&&test.command&&Date.parse(test.command.expiresAt)>Date.now()&&!test.result?test.command:null},cors);return true;}
  json(res,405,{error:'Method not allowed.'},register||welcome||volumeResult?cors:{});
 }catch(e){json(res,400,{error:e.message},register||welcome||volumeResult?cors:{});}return true;
}
module.exports={handleGuestTv,cleanArrivals,activeWelcome,checkoutTime};
