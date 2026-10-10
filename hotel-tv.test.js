'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vl-tv-test-'));process.env.CONTENT_DATA_DIR=dir;
const {defaults,clean,revision,publicFeed,handleHotelTv}=require('./hotel-tv');
const content={settings:{telephone:'01526 123456',openingHours:'Wednesday–Saturday from 6pm',keySafe:'secret'},menus:[{id:'main',name:'Main',visible:true,sections:[{name:'Starters',items:[{name:'Camembert',price:'£12',visible:true},{name:'Hidden dish',visible:false}]}]},{id:'hidden',visible:false}],events:[{id:'future',visible:true,title:'Future',startDate:'2026-11-27T18:30:00Z'},{id:'past',visible:true,title:'Past',startDate:'2026-09-01'},{id:'hidden',visible:false,startDate:'2026-12-01'}],reservations:[{name:'Private guest'}]};
fs.writeFileSync(path.join(dir,'content.json'),JSON.stringify(content));
test('Feed uses current website menus; filters hidden items and dated past events; excludes private data',()=>{const feed=publicFeed(content,defaults(),3,new Date('2026-10-10'));assert.equal(feed.menus[0].sections[0].items[0].price,'£12');assert.equal(feed.menus.length,1);assert.equal(feed.menus[0].sections[0].items.length,1);assert.deepEqual(feed.events.map(e=>e.id),['future']);assert.equal(feed.pages.length,3);assert.ok(feed.pages.every(p=>typeof p.text==='string'));assert.doesNotMatch(JSON.stringify(feed),/secret|Private guest|Hidden dish/);assert.equal(publicFeed(content,defaults(),1),null);const updated=structuredClone(content);updated.menus[0].sections[0].items[0].price='£13';assert.equal(publicFeed(updated,defaults(),3).menus[0].sections[0].items[0].price,'£13');});
test('Settings validate exactly six rooms and reject oversized and malformed messages',()=>{assert.deepEqual(clean(defaults()),defaults());assert.throws(()=>clean({...defaults(),rooms:[]}));assert.throws(()=>clean({...defaults(),notice:'x'.repeat(1001)}));const bad=defaults();bad.rooms[0].enabled='true';assert.throws(()=>clean(bad));});
test('Room endpoint boundaries, auth, same-origin writes, stale-write protection, durable settings',async()=>{
const server=http.createServer(async(req,res)=>{const identity=req.headers['x-test-owner']==='yes'?{isOwner:true,permissions:[]}:req.headers['x-test-staff']==='yes'?{isOwner:false,permissions:['menus']}:null;try{if(!await handleHotelTv(req,res,new URL(req.url,'http://localhost').pathname,identity)){res.writeHead(404);res.end();}}catch(e){res.writeHead(500);res.end(e.message);}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
try{assert.equal((await fetch(base+'/api/admin/tv')).status,401);assert.equal((await fetch(base+'/api/admin/tv',{headers:{'x-test-staff':'yes'}})).status,403);assert.equal((await fetch(base+'/admin/tv',{redirect:'manual'})).status,302);
const owner={'x-test-owner':'yes'};
const got=await fetch(base+'/api/admin/tv',{headers:owner});assert.equal(got.status,200);const tag=got.headers.get('etag');const value=(await got.json()).config;value.notice='Saved notice';
assert.equal((await fetch(base+'/api/admin/tv',{method:'PUT',headers:{...owner,'Content-Type':'application/json','If-Match':tag,Origin:'https://evil.example'},body:JSON.stringify(value)})).status,403);
assert.equal((await fetch(base+'/api/admin/tv',{method:'PUT',headers:{...owner,'Content-Type':'application/json','If-Match':'wrong'},body:JSON.stringify(value)})).status,409);
const saved=await fetch(base+'/api/admin/tv',{method:'PUT',headers:{...owner,'Content-Type':'application/json','If-Match':tag},body:JSON.stringify(value)});assert.equal(saved.status,200);
assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'hotel-tv.json'))).notice,'Saved notice');assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,'content.json'))),content);
assert.equal((await fetch(base+'/api/admin/tv',{method:'PUT',headers:{...owner,'Content-Type':'application/json','If-Match':tag},body:JSON.stringify(value)})).status,409);
const feedResponse=await fetch(base+'/api/tv/rooms/3/content');assert.equal(feedResponse.status,200);assert.equal(feedResponse.headers.get('access-control-allow-origin'),'*');assert.equal((await feedResponse.json()).pages[0].text.includes('Saved notice'),true);
assert.equal((await fetch(base+'/api/tv/rooms/1/content')).status,404);assert.equal((await fetch(base+'/api/tv/rooms/7/content')).status,404);assert.equal((await fetch(base+'/api/tv/rooms/3/content',{method:'POST'})).status,405);
assert.ok((await (await fetch(base+'/api/admin/tv',{headers:owner})).json()).activity.find(a=>a.room===3).lastRequest);
}finally{await new Promise(resolve=>server.close(resolve));}
});
test('Video settings migrate older saved configurations and only publish validated HTTPS clip links',()=>{
 const old=defaults();delete old.videos;assert.deepEqual(clean(old).videos,[]);
 const settings=defaults();settings.videos=[{title:'  Welcome film  ',url:'https://media.example/hotel.mp4'}];
 const valid=clean(settings);assert.equal(valid.videos[0].title,'Welcome film');assert.deepEqual(publicFeed(content,valid,3).videos,valid.videos);
 for(const url of ['javascript:alert(1)','http://media.example/hotel.mp4','https://user:secret@media.example/hotel.mp4'])assert.throws(()=>clean({...settings,videos:[{title:'Film',url}]}));
 assert.throws(()=>clean({...settings,videos:Array(7).fill(settings.videos[0])}));
 const eventContent=structuredClone(content);eventContent.events[0].image='/uploads/event-123.jpg';assert.equal(publicFeed(eventContent,valid,3).events[0].image,'/uploads/event-123.jpg');
 eventContent.events[0].image='https://private.example/secret';assert.equal(publicFeed(eventContent,valid,3).events[0].image,'');
});
