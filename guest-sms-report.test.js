'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const {createStore}=require('./guest-sms-report');
test('latest private report survives replacement, invalid uploads preserve it, and neighbouring data is untouched',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'sms-report-')),dir=path.join(root,'mount');
 try{
  fs.mkdirSync(dir);const untouched=['key-safe-codes.json','content.json','tv-arrivals.json'];for(const name of untouched)fs.writeFileSync(path.join(dir,name),'unchanged');
  const store=createStore({WEBSITE_SITE_NAME:'test',HOME:path.join(root,'old-container')},dir);
  assert.equal(store.read(),null);
  const report={filename:'reservations.csv',headers:['Guest Name','Check In Date'],reservations:[{first:'Jane',phone:'+447700900123',room:'1',checkin:'18/10/2026',unneeded:'discard',keySafeRoom1:'1234'}],cancelled:[]};
  const saved=store.save(report);assert(saved.uploadedAt);assert(!('unneeded' in saved.reservations[0]));assert(!('keySafeRoom1' in saved.reservations[0]));
  const next=createStore({WEBSITE_SITE_NAME:'test',HOME:path.join(root,'new-container')},dir);assert.deepEqual(next.read(),saved);
  assert.throws(()=>next.save({...report,reservations:[]}));assert.deepEqual(next.read(),saved);
  assert.throws(()=>next.save({...report,reservations:[{phone:123}]}));assert.deepEqual(next.read(),saved);
  const updated=next.save({...report,filename:'new.csv',reservations:[{first:'David'}]});assert.equal(next.read().filename,'new.csv');assert.equal(updated.reservations.length,1);
  assert.equal(fs.statSync(path.join(dir,'latest-reservation-upload.json')).mode&0o777,0o600);
  for(const name of untouched)assert.equal(fs.readFileSync(path.join(dir,name),'utf8'),'unchanged');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('opening Guest SMS restores the report without importing TV arrivals or sending SMS',async()=>{
 const elements=new Map(),get=s=>{if(!elements.has(s))elements.set(s,{value:s==='#smsArrivalDay'?'today':'',textContent:'',dataset:{},files:[],innerHTML:''});return elements.get(s);};
 const calls=[],report={filename:'saved.csv',uploadedAt:new Date().toISOString(),headers:['Guest Name','Check In Date'],reservations:[{first:'Jane',room:'1',phone:'+447700900123',checkin:'2000-01-01'}],cancelled:[]};
 const context={document:{querySelector:get,querySelectorAll:()=>[]},Intl,Date,location:{},fetch:async(url,options)=>{calls.push([url,options.method||'GET']);return {ok:true,status:200,json:async()=>url.endsWith('latest-upload')?{report}:url.endsWith('key-safe-codes')?{codes:{'1':'0001'}}:{configured:true}};}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'public/assets/js/guest-sms.js'),'utf8'),context);
 await new Promise(r=>setImmediate(r));
 assert.match(get('#smsUploadStatus').textContent,/Latest upload: saved.csv/);assert.match(get('#smsCount').textContent,/No arrivals found/);
 assert.equal(get('#hotelCsv').disabled,false);assert(calls.every(([,method])=>method==='GET'));assert(!calls.some(([url])=>url.includes('tv-arrivals')||url.endsWith('/send')));
 // Invalid replacement cannot overwrite or clear the restored report.
 get('#hotelCsv').files=[{name:'wrong.csv',text:async()=> 'Other,Columns\nnot,a reservation'}];await get('#hotelCsv').onchange();
 assert.match(get('#smsUploadStatus').textContent,/previous upload has been kept/);assert(calls.every(([,method])=>method==='GET'));
});
