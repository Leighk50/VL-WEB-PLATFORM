'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {dir,contentDir,write:writeTvState}=require('./hotel-tv-storage');
const filename=path.join(dir,'hotel-tv.json');
const activity=new Map();
const {handleGuestTv}=require('./hotel-tv-guests');
const {explore}=require('./hotel-tv-explore');
const {airtime}=require('./hotel-tv-airtime');
const mediaDir=path.join(dir,'tv-media'),MAX_VIDEO_BYTES=100*1024*1024;
function defaults(){return {version:1,notice:'',welcomeTitle:'Make yourself at home',welcomeText:'Welcome to The Village Limits. We hope you enjoy your stay.',videos:[],welcomeVideo:null,rooms:Array.from({length:6},(_,i)=>({id:i+1,label:'Room '+(i+1),enabled:false,message:''}))};}
function readConfig(){try{return JSON.parse(fs.readFileSync(filename,'utf8'));}catch(e){if(e.code==='ENOENT')return defaults();throw e;}}
function revision(value){return '"'+crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')+'"';}
function clean(value){if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid TV settings.');const out=defaults();for(const [key,max] of [['notice',1000],['welcomeTitle',120],['welcomeText',2000]]){if(typeof value[key]!=='string'||value[key].length>max)throw Error('Invalid '+key);out[key]=value[key].trim();}if(!out.welcomeTitle)throw Error('Enter a welcome title.');if(!Array.isArray(value.rooms)||value.rooms.length!==6)throw Error('Expected six rooms.');out.videos=cleanVideos(value.videos);out.welcomeVideo=value.welcomeVideo==null?null:cleanVideos([value.welcomeVideo])[0];out.rooms=value.rooms.map((r,i)=>{if(!r||r.id!==i+1||typeof r.enabled!=='boolean'||typeof r.label!=='string'||!r.label.trim()||r.label.length>80||typeof r.message!=='string'||r.message.length>1500)throw Error('Invalid room '+(i+1));return {id:i+1,label:r.label.trim(),enabled:r.enabled,message:r.message.trim()};});return out;}
function cleanVideos(value){
 if(value===undefined)return [];
 if(!Array.isArray(value)||value.length>6)throw Error('Add up to six video clips.');
 return value.map(v=>{if(!v||typeof v.title!=='string'||!v.title.trim()||v.title.length>120||typeof v.url!=='string'||v.url.length>2000)throw Error('Each clip needs a title and an HTTPS video address.');let address;try{address=new URL(v.url.trim());}catch{throw Error('Invalid video address.');}if(address.protocol!=='https:'||address.username||address.password)throw Error('Video addresses must use HTTPS without login details.');return {title:v.title.trim(),url:address.href};});
}
function saveConfig(value){writeTvState('hotel-tv.json',value);}
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
 const feed={schemaVersion:1,room:{id:room.id,label:room.label},pages:[{title:config.welcomeTitle,text:welcome},{title:'Dining at The Village Limits',text:dining||'Please speak to our team about dining.'},{title:"What's on",text:happening}],menus,events,videos,welcomeVideo:config.welcomeVideo?cleanVideos([config.welcomeVideo])[0]:null,contact:{telephone:text(settings.telephone),openingHours:text(settings.openingHours)},links:{menus:'/eat',events:'/whats-on'},apps:[{name:'Airtime',id:'34r7A9IqwB.airwave'}]};feed.revision=revision(feed).slice(1,-1);return feed;
}
function json(res,status,value,headers={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(JSON.stringify(value));}
async function body(req){let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>40000)throw Error('TV settings are too large.');}return JSON.parse(raw);}
function sameOrigin(req){if(!req.headers.origin)return true;try{return new URL(req.headers.origin).host===req.headers.host;}catch{return false;}}
async function uploadVideo(req,res){
 if(!String(req.headers['content-type']||'').split(';')[0].match(/^video\/mp4$/i))return json(res,415,{error:'Please upload an MP4 video.'});
 if(Number(req.headers['content-length'])>MAX_VIDEO_BYTES)return json(res,413,{error:'The video must be 100 MB or smaller.'});
 fs.mkdirSync(mediaDir,{recursive:true});const name=crypto.randomUUID()+'.mp4',temp=path.join(mediaDir,name+'.tmp'),target=path.join(mediaDir,name);let size=0,handle;
 try{handle=await fs.promises.open(temp,'wx');for await(const chunk of req){size+=chunk.length;if(size>MAX_VIDEO_BYTES){const error=Error('The video must be 100 MB or smaller.');error.status=413;throw error;}await handle.writeFile(chunk);}await handle.close();handle=null;
  const fd=await fs.promises.open(temp,'r');const header=Buffer.alloc(32);await fd.read(header,0,32,0);await fd.close();
  if(size<24||header.toString('ascii',4,8)!=='ftyp'){const error=Error('This file is not a valid MP4 container.');error.status=415;throw error;}
  await fs.promises.rename(temp,target);json(res,201,{ok:true,path:'/tv/media/'+name,size});
 }catch(e){if(handle)await handle.close();await fs.promises.unlink(temp).catch(()=>{});if(!res.destroyed)json(res,e.status||400,{error:e.status?e.message:'Video upload failed. Please try again.'});}
}
function serveVideo(req,res,pathname){
 const match=pathname.match(/^\/tv\/media\/([a-f0-9-]{36}\.mp4)$/);if(!match){res.writeHead(404);res.end();return;}
 if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405,{Allow:'GET, HEAD'});res.end();return;}
 const file=path.join(mediaDir,match[1]);let stat;try{stat=fs.statSync(file);}catch{res.writeHead(404);res.end();return;}
 let start=0,end=stat.size-1,code=200;const headers={'Content-Type':'video/mp4','Accept-Ranges':'bytes','Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'};
 if(req.headers.range){const range=String(req.headers.range).match(/^bytes=(\d*)-(\d*)$/);if(!range||(!range[1]&&!range[2])){res.writeHead(416,{'Content-Range':'bytes */'+stat.size});res.end();return;}
  if(!range[1])start=Math.max(0,stat.size-Number(range[2]));else start=Number(range[1]);if(range[1]&&range[2])end=Math.min(end,Number(range[2]));
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=stat.size){res.writeHead(416,{'Content-Range':'bytes */'+stat.size});res.end();return;}code=206;headers['Content-Range']='bytes '+start+'-'+end+'/'+stat.size;
 }
 headers['Content-Length']=end-start+1;res.writeHead(code,headers);if(req.method==='HEAD'){res.end();return;}const stream=fs.createReadStream(file,{start,end});stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
}
async function handleHotelTv(req,res,pathname,identity){
 if(await handleGuestTv(req,res,pathname,identity,id=>readConfig().rooms.some(r=>r.id===id&&r.enabled)))return true;
 if(pathname.startsWith('/tv/media/')){serveVideo(req,res,pathname);return true;}
 if(pathname==='/api/admin/tv/video'){
  if(!identity)return json(res,401,{error:'Please sign in.'}),true;
  if(!identity.isOwner&&!identity.permissions.includes('settings'))return json(res,403,{error:'Website Details permission is required.'}),true;
  if(req.method!=='POST')return json(res,405,{error:'Method not allowed.'},{Allow:'POST'}),true;
  if(!sameOrigin(req))return json(res,403,{error:'Invalid request origin.'}),true;
  await uploadVideo(req,res);return true;
 }
 if(pathname==='/tv/install/sssp_config.xml'||pathname==='/tv/install/VillageLimits.wgt'){
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405,{Allow:'GET, HEAD'});res.end();return true;}
  const releaseFile=path.join(__dirname,'hotel-tv-install','VillageLimits-1.2.2.wgt.base64');if(!fs.existsSync(releaseFile)){res.writeHead(503,{'Cache-Control':'no-store'});res.end('The all-room release is awaiting its signed package.');return true;}
  const pkg=Buffer.from(fs.readFileSync(releaseFile,'utf8'),'base64'),manifest=pathname.endsWith('sssp_config.xml');const data=manifest?Buffer.from('<?xml version="1.0" encoding="UTF-8"?>\n<widget><ver>1.2.2</ver><size>'+pkg.length+'</size><widgetname>VillageLimits</widgetname><webtype>tizen</webtype></widget>\n'):pkg;res.writeHead(200,{'Content-Type':manifest?'application/xml; charset=utf-8':'application/widget','Content-Length':data.length,'Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:data);return true;
 }
 const installerFiles={'/tv/install/room3/sssp_config.xml':'manifest','/tv/install/room3/VillageLimits.wgt':'package'};
 if(Object.hasOwn(installerFiles,pathname)){
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405,{Allow:'GET, HEAD'});res.end();return true;}
  const pkg=Buffer.from(fs.readFileSync(path.join(__dirname,'hotel-tv-install','VillageLimits.wgt.base64'),'utf8'),'base64');
  const manifest=installerFiles[pathname]==='manifest';
  const data=manifest?Buffer.from('<?xml version="1.0" encoding="UTF-8"?>\n<widget><ver>0.4.8</ver><size>'+pkg.length+'</size><widgetname>VillageLimits</widgetname><webtype>tizen</webtype></widget>\n'):pkg;
  res.writeHead(200,{'Content-Type':manifest?'application/xml; charset=utf-8':'application/widget','Content-Length':data.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(req.method==='HEAD'?undefined:data);return true;
 }

 if(pathname==='/admin/tv'){if(!identity){res.writeHead(302,{Location:'/admin'});res.end();return true;}if(!identity.isOwner&&!identity.permissions.includes('settings')){res.writeHead(403);res.end('Access denied');return true;}if(req.method!=='GET'){res.writeHead(405);res.end();return true;}res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(fs.readFileSync(path.join(__dirname,'hotel-tv-admin.html')));return true;}
 if(pathname==='/api/admin/tv'){
  if(!identity)return json(res,401,{error:'Please sign in.'}),true;
  if(!identity.isOwner&&!identity.permissions.includes('settings'))return json(res,403,{error:'Website Details permission is required.'}),true;
  const config=readConfig();
  if(req.method==='GET')return json(res,200,{config,activity:config.rooms.map(r=>({room:r.id,...(typeof activity.get(r.id)==='object'?activity.get(r.id):{lastRequest:activity.get(r.id)||null}),appVersion:typeof activity.get(r.id)==='object'?activity.get(r.id).appVersion:null}))},{ETag:revision(config)}),true;
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
  const content=JSON.parse(fs.readFileSync(path.join(contentDir,'content.json'),'utf8').replace(/^\uFEFF/,''));
  const room=Number(match[1]),feed=publicFeed(content,readConfig(),room);if(!feed)return json(res,404,{error:'This room is not enabled.'},{'Access-Control-Allow-Origin':'*'}),true;
  if(new URL(req.url,'http://localhost').searchParams.get('preview')!=='1'){const reported=new URL(req.url,'http://localhost').searchParams.get('appVersion');activity.set(room,{lastRequest:new Date().toISOString(),appVersion:/^\d+\.\d+\.\d+$/.test(reported||'')?reported:null});}
  feed.explore=await explore();feed.airtime=airtime();feed.revision=revision(feed).slice(1,-1);
  json(res,200,feed,{'Access-Control-Allow-Origin':'*'});return true;
 }
 return false;
}
module.exports={handleHotelTv,defaults,clean,revision,publicFeed};


