'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createStorage}=require('./hotel-tv-storage');
test('TV approvals, bookings, settings and media survive container replacement; migration never overwrites durable state',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'tv-persist-'));
 try{
  const old=path.join(root,'container1','site','data'),durable=path.join(root,'mounted','tv');fs.mkdirSync(path.join(old,'tv-media'),{recursive:true});
  fs.writeFileSync(path.join(old,'tv-devices.json'),JSON.stringify([{id:'approved-tv',room:1,approved:true}]));fs.writeFileSync(path.join(old,'tv-media','abc-123.mp4'),'video');
  const a=createStorage({HOME:path.join(root,'container1'),WEBSITE_SITE_NAME:'test'},durable);assert.equal(a.dir,durable);assert(fs.existsSync(path.join(durable+'-backups','tv-devices.json')),'imported approvals receive a recovery copy immediately');assert.equal(JSON.parse(fs.readFileSync(path.join(durable,'tv-devices.json')))[0].approved,true);
  a.write('hotel-tv.json',{welcomeVideo:{url:'/tv/media/abc-123.mp4'}});a.write('tv-arrivals.json',{items:[{room:1,first:'Test',last:'Guest'}]});a.write('tv-devices.json',[{id:'approved-tv',room:1,approved:true}]);
  fs.rmSync(path.join(root,'container1'),{recursive:true});const b=createStorage({HOME:path.join(root,'container2'),WEBSITE_SITE_NAME:'test'},durable);
  assert.equal(b.dir,durable);assert.equal(JSON.parse(fs.readFileSync(path.join(b.dir,'tv-arrivals.json'))).items[0].first,'Test');assert.equal(fs.readFileSync(path.join(b.dir,'tv-media','abc-123.mp4'),'utf8'),'video');
  b.write('tv-devices.json',[{id:'approved-tv',room:1,approved:false}]);fs.unlinkSync(path.join(durable,'tv-devices.json'));createStorage({HOME:path.join(root,'container2'),WEBSITE_SITE_NAME:'test'},durable);assert.equal(JSON.parse(fs.readFileSync(path.join(durable,'tv-devices.json')))[0].approved,false,'recovery must retain revocation');
  const legacy=path.join(root,'legacy');fs.mkdirSync(legacy);fs.writeFileSync(path.join(legacy,'hotel-tv.json'),'{}');createStorage({CONTENT_DATA_DIR:legacy,WEBSITE_SITE_NAME:'test'},durable);assert(JSON.parse(fs.readFileSync(path.join(durable,'hotel-tv.json'))).welcomeVideo);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
