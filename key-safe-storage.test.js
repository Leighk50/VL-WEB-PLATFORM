'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createStorage}=require('./key-safe-storage');
test('codes survive container replacement, migrate privately, and recover without touching other systems',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'keysafe-'));
 try {
  const old=path.join(root,'old'),durable=path.join(root,'mount','sms');fs.mkdirSync(old);
  const codes={'1':'0012','2':'2345','3':'3456','4':'4567','5':'5678','6':'6789'};
  fs.writeFileSync(path.join(old,'key-safe-codes.json'),JSON.stringify(codes));
  for(const name of ['content.json','hotel-tv.json','tv-arrivals.json','tv-devices.json'])fs.writeFileSync(path.join(old,name),'unchanged');
  const a=createStorage({CONTENT_DATA_DIR:old,WEBSITE_SITE_NAME:'test'},durable);
  assert.deepEqual(a.read(),codes);
  for(const name of ['content.json','hotel-tv.json','tv-arrivals.json','tv-devices.json'])assert.equal(fs.readFileSync(path.join(old,name),'utf8'),'unchanged');
  assert.equal(fs.statSync(path.join(durable,'key-safe-codes.json')).mode&0o777,0o600);
  const changed={...codes,'1':'0099'};a.write(changed);
  const b=createStorage({HOME:path.join(root,'replacement'),WEBSITE_SITE_NAME:'test'},durable);
  assert.deepEqual(b.read(),changed);
  fs.unlinkSync(path.join(durable,'key-safe-codes.json'));assert.deepEqual(b.read(),changed);
  assert.throws(()=>b.write({'1':'bad'}),/digits/);assert.deepEqual(b.read(),changed);
  fs.writeFileSync(path.join(durable,'key-safe-codes.json'),'broken');
  assert.throws(()=>b.read(),/could not be loaded/);assert.throws(()=>b.write({}),/could not be loaded/);
 } finally {fs.rmSync(root,{recursive:true,force:true});}
});
test('local storage retains configured path and rejects malformed saves',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'keysafe-local-'));
 try {const store=createStorage({CONTENT_DATA_DIR:root});assert.equal(store.read()['1'],'');assert.throws(()=>store.write(),/Invalid/);store.write({'1':'0001'});assert.equal(store.read()['1'],'0001');}finally{fs.rmSync(root,{recursive:true,force:true});}
});
