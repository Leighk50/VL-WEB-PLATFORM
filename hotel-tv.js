'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const dir=process.env.CONTENT_DATA_DIR||(process.env.HOME?path.join(process.env.HOME,'site','data'):path.join(__dirname,'data'));
const filename=path.join(dir,'hotel-tv.json');
const activity=new Map();
function defaults(){return {version:1,notice:'',welcomeTitle:'Make yourself at home',welcomeText:'Welcome to The Village Limits. We hope you enjoy your stay.',videos:[],rooms:Array.from({length:6},(_,i)=>({id:i+1,label:'Room '+(i+1),enabled:i===2,message:''}))};}
function readConfig(){try{return JSON.parse(fs.readFileSync(filename,'utf8'));}catch(e){if(e.code==='ENOENT')return defaults();throw e;}}
function revision(value){return '"'+crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')+'"';}
function clean(value){if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid TV settings.');const out=defaults();for(const [key,max] of [['notice',1000],['welcomeTitle',120],['welcomeText',2000]]){if(typeof value[key]!=='string'||value[key].length>max)throw Error('Invalid '+key);out[key]=value[key].trim();}if(!out.welcomeTitle)throw Error('Enter a welcome title.');if(!Array.isArray(value.rooms)||value.rooms.length!==6)throw Error('Expected six rooms.');out.videos=cleanVideos(value.videos);out.rooms=value.rooms.map((r,i)=>{if(!r||r.id!==i+1||typeof r.enabled!=='boolean'||typeof r.label!=='string'||!r.label.trim()||r.label.length>80||typeof r.message!=='string'||r.message.length>1500)throw Error('Invalid room '+(i+1));return {id:i+1,label:r.label.trim(),enabled:r.enabled,message:r.message.trim()};});return out;}
function cleanVideos(value){
 if(value===undefined)return [];
 if(!Array.isArray(value)||value.length>6)throw Error('Add up to six video clips.');
 return value.map(v=>{if(!v||typeof v.title!=='string'||!v.title.trim()||v.title.length>120||typeof v.url!=='string'||v.url.length>2000)throw Error('Each clip needs a title and an HTTPS video address.');let address;try{address=new URL(v.url.trim());}catch{throw Error('Invalid video address.');}if(address.protocol!=='https:'||address.username||address.password)throw Error('Video addresses must use HTTPS without login details.');return {title:v.title.trim(),url:address.href};});
}
function saveConfig(value){fs.mkdirSync(dir,{recursive:true});if(fs.existsSync(filename))fs.copyFileSync(filename,filename+'.previous');const temp=filename+'.tmp';fs.writeFileSync(temp,JSON.stringify(value,null,2),'utf8');fs.renameSync(temp,filename);}
function publicFeed(content,config,roomId,now=new Date()){
 const room=config.rooms.find(r=>r.id===roomId&&r.enabled);if(!room)return null;
 const text=v=>typeof v==='string'?v:'';
 const menus=(content.menus||[]).filter(m=>m.visible===true).map(m=>({id:text(m.id),name:text(m.name),description:text(m.description),sections:(m.sections||[]).map(s=>({name:text(s.name),items:(s.items||[]).filter(i=>i.visible!==false).map(i=>({name:text(i.name),description:text(i.description),price:text(i.price),allergens:text(i.allergens)}))})).filter(s=>s.items.length)}));
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 const events=(content.events||[]).filter(e=>{if(e.visible!==true)return false;const date=text(e.endDate)||text(e.startDate);return !date||date.slice(0,10)>=today;}).map(e=>({id:text(e.id),title:text(e.title),date:text(e.date),startDate:text(e.startDate),description:text(e.description),price:text(e.price),image:/^\/uploads\/[a-zA-Z0-9_.-]+$/.test(text(e.image))?text(e.image):'',soldOut:e.soldOut===true||e.availability==='sold-out'}));
 const videos=cleanVideos(config.videos);
 const settings=content.settings||{};
 const welcome=[config.welcomeText,room.message,config.notice].filter(Boolean).join('\n\n');
 const dining=[text(settings.openingHours),...menus.map(m=>m.name+'\n'+m.sections.map(s=>s.name+'\n'+s.items.map(i=>i.name+(i.price?' — '+i.price:'')+(i.description?'\n'+i.description:'')).join('\n\n')).join('\n\n'))].filter(Boolean).join('\n\n');
 const happening=events.length?events.map(e=>[e.title,e.date||e.startDate,e.description,e.soldOut?'Currently sold out':e.price?e.price:''].filter(Boolean).join('\n')).join('\n\n'):'Please ask our team about forthcoming events.';
 const feed={schemaVersion:1,room:{id:room.id,label:room.label},pages:[{title:config.welcomeTitle,text:welcome},{title:'Dining at The Village Limits',text:dining||'Please speak to our team about dining.'},{title:"What's on",text:happening}],menus,events,videos,contact:{telephone:text(settings.telephone),openingHours:text(settings.openingHours)},links:{menus:'/eat',events:'/whats-on'},apps:[{name:'Airtime',id:'34r7A9IqwB.airwave'}]};feed.revision=revision(feed).slice(1,-1);return feed;
}
function json(res,status,value,headers={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(JSON.stringify(value));}
async function body(req){let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>40000)throw Error('TV settings are too large.');}return JSON.parse(raw);}
async function handleHotelTv(req,res,pathname,identity){
 const installerFiles={'/tv/install/room3/sssp_config.xml':'manifest','/tv/install/room3/VillageLimits.wgt':'package'};
 if(Object.hasOwn(installerFiles,pathname)){
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405,{Allow:'GET, HEAD'});res.end();return true;}
  const pkg=Buffer.from(fs.readFileSync(path.join(__dirname,'hotel-tv-install','VillageLimits.wgt.base64'),'utf8'),'base64');
  const manifest=installerFiles[pathname]==='manifest';
  const data=manifest?Buffer.from('<?xml version="1.0" encoding="UTF-8"?>\n<widget><ver>0.3.1</ver><size>'+pkg.length+'</size><widgetname>VillageLimits</widgetname><webtype>tizen</webtype></widget>\n'):pkg;
  res.writeHead(200,{'Content-Type':manifest?'application/xml; charset=utf-8':'application/widget','Content-Length':data.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(req.method==='HEAD'?undefined:data);return true;
 }

 if(pathname==='/admin/tv'){if(!identity){res.writeHead(302,{Location:'/admin'});res.end();return true;}if(!identity.isOwner&&!identity.permissions.includes('settings')){res.writeHead(403);res.end('Access denied');return true;}if(req.method!=='GET'){res.writeHead(405);res.end();return true;}res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(fs.readFileSync(path.join(__dirname,'hotel-tv-admin.html')));return true;}
 if(pathname==='/api/admin/tv'){
  if(!identity)return json(res,401,{error:'Please sign in.'}),true;
  if(!identity.isOwner&&!identity.permissions.includes('settings'))return json(res,403,{error:'Website Details permission is required.'}),true;
  const config=readConfig();
  if(req.method==='GET')return json(res,200,{config,activity:config.rooms.map(r=>({room:r.id,lastRequest:activity.get(r.id)||null}))},{ETag:revision(config)}),true;
  if(req.method==='PUT'){
   if(!String(req.headers['content-type']||'').startsWith('application/json'))return json(res,415,{error:'JSON required.'}),true;
   if(req.headers.origin){try{if(new URL(req.headers.origin).host!==req.headers.host)return json(res,403,{error:'Invalid request origin.'}),true;}catch{return json(res,403,{error:'Invalid request origin.'}),true;}}
   if(req.headers['if-match']!==revision(config))return json(res,409,{error:'TV settings changed in another session. Reload before saving.'}),true;
   let next;try{next=clean(await body(req));}catch(e){return json(res,400,{error:e.message}),true;}
   saveConfig(next);json(res,200,{ok:true,config:next},{ETag:revision(next)});return true;
  }json(res,405,{error:'Method not allowed.'},{Allow:'GET, PUT'});return true;
 }
 const match=pathname.match(/^\/api\/tv\/rooms\/([1-6])\/content$/);
 if(match){if(req.method!=='GET')return json(res,405,{error:'Method not allowed.'},{Allow:'GET'}),true;
  const content=JSON.parse(fs.readFileSync(path.join(dir,'content.json'),'utf8').replace(/^\uFEFF/,''));
  const room=Number(match[1]),feed=publicFeed(content,readConfig(),room);if(!feed)return json(res,404,{error:'This room is not enabled.'},{'Access-Control-Allow-Origin':'*'}),true;
  if(new URL(req.url,'http://localhost').searchParams.get('preview')!=='1')activity.set(room,new Date().toISOString());
  json(res,200,feed,{'Access-Control-Allow-Origin':'*'});return true;
 }
 return false;
}
module.exports={handleHotelTv,defaults,clean,revision,publicFeed};
