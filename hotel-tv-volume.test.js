'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
test('Central volume pilot requires staff, targets only approved Room 1, validates result and expires',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vl-volume-'));process.env.CONTENT_DATA_DIR=dir;const {handleGuestTv}=require('./hotel-tv-guests');
 const server=http.createServer(async(req,res)=>{if(!await handleGuestTv(req,res,new URL(req.url,'http://localhost').pathname,req.headers['x-owner']?{isOwner:true}:null,()=>true)){res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 async function call(p,method='GET',body,headers={}){const r=await fetch(base+p,{method,headers:{'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json()};}
 try{
  assert.equal((await call('/api/admin/tv/volume-test','POST',{room:1,volume:22})).status,401);
  assert.equal((await call('/api/admin/tv/volume-test','POST',{room:2,volume:22},{'x-owner':'1'})).status,400);
  assert.equal((await call('/api/admin/tv/volume-test','POST',{room:1,volume:90},{'x-owner':'1'})).status,400);
  const c=(await call('/api/admin/tv/volume-test','POST',{room:1,volume:22},{'x-owner':'1'})).data.command;
  assert.equal((await call('/api/tv/rooms/1/welcome')).status,403);
  const token='a'.repeat(64);const reg=await call('/api/tv/device-register','POST',{room:1,token});let list=JSON.parse(fs.readFileSync(path.join(dir,'tv-devices.json')));assert.equal((await call('/api/tv/rooms/1/welcome','GET',undefined,{'X-TV-Token':token})).status,403);
  await call('/api/admin/tv/devices','POST',{id:list[0].id,action:'approve'},{'x-owner':'1'});
  assert.equal((await call('/api/tv/rooms/1/welcome','GET',undefined,{'X-TV-Token':token})).data.volumeTest.id,c.id);
  assert.equal((await call('/api/tv/rooms/2/welcome','GET',undefined,{'X-TV-Token':token})).status,403);
  assert.equal((await call('/api/tv/rooms/1/volume-result','POST',{id:'wrong'},{'X-TV-Token':token})).status,400);
  const report=await call('/api/tv/rooms/1/volume-result','POST',{id:c.id,before:10,after:22,methods:['tizen.tvaudiocontrol.setVolume']},{'X-TV-Token':token});assert.equal(report.status,200);
  assert.equal((await call('/api/tv/rooms/1/welcome','GET',undefined,{'X-TV-Token':token})).data.volumeTest,null);
  assert.equal((await call('/api/admin/tv/volume-test','GET',undefined,{'x-owner':'1'})).data.result.after,22);
  fs.writeFileSync(path.join(dir,'tv-volume-test.json'),JSON.stringify({command:{...c,expiresAt:'2000-01-01'},result:null}));assert.equal((await call('/api/tv/rooms/1/welcome','GET',undefined,{'X-TV-Token':token})).data.volumeTest,null);
 }finally{await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});}
});
test('TV executes a pilot once, retries its receipt, and ignores preview, hidden, wrong-room and expired commands',()=>{
 const vm=require('node:vm'),source=fs.readFileSync(path.join(__dirname,'hotel-tv-client/tv.js'),'utf8');const code=source.slice(source.indexOf('function applyRemoteVolumeTest('),source.indexOf('function renderRoomSetup(){'));let volume=10,sets=0,reports=0;const cache=new Map();
 const context={preview:false,room:1,document:{hidden:false},origin:'https://test',guestToken:'token',diagRecord:()=>{},localStorage:{getItem:k=>cache.get(k),setItem:(k,v)=>cache.set(k,v)},tizen:{tvaudiocontrol:{getVolume:()=>volume,setVolume:v=>{volume=v;sets++;}}},XMLHttpRequest:function(){this.open=()=>{};this.setRequestHeader=()=>{};this.send=()=>{reports++;};}};context.window=context;vm.createContext(context);vm.runInContext(code,context);const c={id:'test-id',room:1,volume:22,expiresAt:new Date(Date.now()+100000).toISOString()};context.applyRemoteVolumeTest(c);context.applyRemoteVolumeTest(c);assert.equal(sets,1);assert.equal(reports,2);assert.equal(volume,22);
 for(const changes of [{preview:true},{room:2},{document:{hidden:true}}]){Object.assign(context,changes);context.applyRemoteVolumeTest({...c,id:'different'});Object.assign(context,{preview:false,room:1,document:{hidden:false}});}context.applyRemoteVolumeTest({...c,id:'expired',expiresAt:'2000-01-01'});context.applyRemoteVolumeTest({...c,id:'bad',expiresAt:'invalid'});assert.equal(sets,1);
});
