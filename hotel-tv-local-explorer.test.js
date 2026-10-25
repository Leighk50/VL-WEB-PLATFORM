'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {clean,createExplorer}=require('./hotel-tv-local-explorer');
const walk=()=>({...require('./hotel-tv-local-explorer-seed.json')[0]});
test('Only reviewed non-competing categories and safe destinations may be published',()=>{
 for(const value of [{category:'restaurants'},{title:'Pub music night'},{venue:'A competing hotel'},{description:'Afternoon tea offer'},{foodLed:true},{competitorVenue:true},{url:'javascript:alert(1)'},{url:'https://user:pass@example.com/'},{url:'https://127.0.0.1/'},{status:'approved'}])assert.throws(()=>clean({...walk(),...value}));
 assert.equal(clean(walk()).status,'draft');assert.equal(clean({...walk(),status:'approved',reviewedNonCompeting:true}).status,'approved');
 assert.throws(()=>clean({...walk(),url:'https://wowlincs.co.uk/',status:'approved',reviewedNonCompeting:true}));
 assert.throws(()=>clean({...walk(),image:'https://example.com/image.jpg'}));
});
test('Drafts remain private, expired events vanish at their end instant and withdrawn places disappear',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'explorer-')),store={dir,write:(name,data)=>fs.writeFileSync(path.join(dir,name),JSON.stringify(data))},api=createExplorer(store);
 try{assert.deepEqual(api.published(),[]);const item={...require('./hotel-tv-local-explorer-seed.json')[2],status:'approved',reviewedNonCompeting:true};api.save([walk(),item]);assert.equal(api.published(new Date('2026-10-26T15:59:59Z')).length,1);assert.equal(api.published(new Date('2026-10-26T16:00:00Z')).length,0);api.save([{...item,status:'draft'}]);assert.equal(api.published(new Date('2026-10-26T15:00:00Z')).length,0);assert.throws(()=>api.save([walk(),walk()]));assert.throws(()=>clean({...item,endsAt:item.startsAt}));assert.throws(()=>clean({...item,startsAt:'2026-10-26T14:00:00'}));}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('Explorer state restores independently after replacement without overwriting TV assignments and approvals',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'explorer-storage-')),durable=path.join(root,'state');
 try{const storage=require('./hotel-tv-storage').createStorage({WEBSITE_SITE_NAME:'test',CONTENT_DATA_DIR:path.join(root,'legacy')},durable);storage.write('tv-devices.json',{approved:'unchanged'});const api=createExplorer(storage);api.save([{...walk(),status:'approved',reviewedNonCompeting:true}]);fs.unlinkSync(path.join(durable,'tv-local-explorer.json'));const restored=require('./hotel-tv-storage').createStorage({WEBSITE_SITE_NAME:'test',CONTENT_DATA_DIR:path.join(root,'replacement')},durable);assert.equal(createExplorer(restored).published().length,1);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(durable,'tv-devices.json'))),{approved:'unchanged'});}finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('Staff writes require permission, same origin and current revision; normal feeds and other rooms exclude pilot records',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'explorer-http-'));process.env.CONTENT_DATA_DIR=dir;
 for(const name of ['./hotel-tv','./hotel-tv-storage','./hotel-tv-guests'])delete require.cache[require.resolve(name)];
 const {handleHotelTv,defaults}=require('./hotel-tv');const config=defaults();config.rooms.forEach(r=>r.enabled=true);fs.writeFileSync(path.join(dir,'hotel-tv.json'),JSON.stringify(config));fs.writeFileSync(path.join(dir,'content.json'),JSON.stringify({settings:{},menus:[],events:[]}));
 const server=http.createServer(async(req,res)=>{try{const identity=req.headers['x-test-owner']?{isOwner:true,permissions:[]}:req.headers['x-test-user']?{isOwner:false,permissions:[]}:null;if(!await handleHotelTv(req,res,new URL(req.url,'http://localhost').pathname,identity)){res.writeHead(404);res.end();}}catch(e){res.writeHead(500);res.end(e.message);}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,endpoint=base+'/api/admin/tv/local-explorer';
 try{
  assert.equal((await fetch(endpoint)).status,401);assert.equal((await fetch(endpoint,{headers:{'x-test-user':'1'}})).status,403);
  const initial=await fetch(endpoint,{headers:{'x-test-owner':'1'}});const etag=initial.headers.get('etag');const headers={'x-test-owner':'1','content-type':'application/json','if-match':etag},body=JSON.stringify({items:[{...walk(),status:'approved',reviewedNonCompeting:true}]});
  assert.equal((await fetch(endpoint,{method:'PUT',headers:{...headers,origin:'https://evil.example'},body})).status,403);
  assert.equal((await fetch(endpoint,{method:'PUT',headers:{...headers,'if-match':'old'},body})).status,409);
  assert.equal((await fetch(endpoint,{method:'PUT',headers,body})).status,200);
  const plain=await (await fetch(base+'/api/tv/rooms/1/content?preview=1')).json(),pilot=await (await fetch(base+'/api/tv/rooms/1/content?preview=1&localExplorerPilot=1')).json(),other=await (await fetch(base+'/api/tv/rooms/2/content?preview=1&localExplorerPilot=1')).json();
  assert.equal(plain.explore.localExplorer,undefined);assert.equal(other.explore.localExplorer,undefined);assert.equal(pilot.explore.localExplorer.items.length,1);assert.deepEqual(pilot.explore.attractions,plain.explore.attractions);assert.deepEqual(pilot.explore.cinema,plain.explore.cinema);
  fs.writeFileSync(path.join(dir,'tv-local-explorer.json'),'bad json');const fallback=await (await fetch(base+'/api/tv/rooms/1/content?preview=1&localExplorerPilot=1')).json();assert.equal(fallback.explore.localExplorer.status,'unavailable');assert(fallback.explore.cinema);
  assert.equal((await fetch(base+'/tv/local-explorer-pilot/')).status,200);
 }finally{await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});delete process.env.CONTENT_DATA_DIR;}
});
test('Pilot retains signed media and keeps Kinema first without replacing the signed installer',()=>{
 const js=fs.readFileSync('hotel-tv-local-explorer-client/tv.js','utf8');assert(js.includes("['cinema','Kinema']"));assert(js.includes("['walks','Walks & Nature']"));assert(js.includes("['events','Local Events']"));assert(js.includes('channel-number-display'));assert(js.includes("p.id!=='petwood'"));
 const {media}=require('./hotel-tv-local-explorer-assets');assert.equal(media('lindus-combined-test.mp4').length,29695634);assert.equal(media('lindus-welcome-music.wav').length,5760044);assert.throws(()=>media('../config.xml'));
});
test('Remote-style tab actions render approved walks and events, omit expired cache items, and retain Kinema toggle',()=>{
 const vm=require('node:vm'),source=fs.readFileSync('hotel-tv-local-explorer-client/tv.js','utf8');
 class Element{constructor(tag,text='',cls=''){this.tag=tag;this.textContent=text;this.className=cls;this.children=[];}appendChild(c){this.children.push(c);return c;}querySelector(){return null;}focus(){}}
 const panel=new Element('section'),now=new Date(),event={...require('./hotel-tv-local-explorer-seed.json')[2],title:'<img onerror=alert(1)>',endsAt:new Date(Date.now()+3600000).toISOString()},expired={...event,id:'expired',title:'Expired item',endsAt:new Date(Date.now()-1000).toISOString()};
 const context={panel,data:{explore:{attractions:require('./hotel-tv-attractions.json'),localExplorer:{items:[walk(),event,expired]},cinema:{status:'available',updatedAt:now.toISOString(),days:[{date:'Today',films:[{title:'Film today',times:['12:30']}]},{date:'Tomorrow',films:[{title:'Film tomorrow',times:['13:00']}]}]}}},localSection:'cinema',localIndex:0,cinemaDay:0,Date,isFinite,document:{createElement:t=>new Element(t)},heading(){},node:(...a)=>new Element(...a),action:(text,fn,cls)=>Object.assign(new Element('button',text,cls),{onclick:fn})};
 context.render=()=>{panel.children=[];context.renderExplore();};vm.createContext(context);vm.runInContext(source.slice(source.indexOf('function renderExplore(){'),source.indexOf('function focusStayTab(){')),context);
 const all=(n)=>[n,...n.children.flatMap(all)],texts=()=>all(panel).map(e=>e.textContent),click=text=>{const el=all(panel).find(e=>e.tag==='button'&&e.textContent===text);assert(el,'Missing '+text);el.onclick();};
 context.render();assert(texts().includes('Film today'));click('Tomorrow');assert(texts().includes('Film tomorrow'));assert(texts().includes('Today'));click('Walks & Nature');assert(texts().includes(walk().title));click('Local Events');assert(texts().includes(event.title));assert(!texts().includes('Expired item'));click('Kinema');assert(texts().includes('Film tomorrow'));
});
