'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
const {slots,arrivalFits,availableTables,createStore,saveBooking,setStatus,arrivalInstant}=require('./reservations');
const day='2030-01-09',now=new Date('2030-01-01T00:00:00Z');
const state=()=>({version:1,revision:0,bookings:[],overrides:{},audit:[]});
const input=(extra={})=>({date:day,time:'18:00',covers:2,dogs:false,name:'Test Guest',phone:'01234567890',...extra});
test('normal slots include extra final times, with no Monday or Tuesday service',()=>{
  assert.deepEqual(slots(day),['18:00','18:20','18:40','19:00','19:20','19:30']);
  assert.deepEqual(slots('2030-01-13'),['12:00','12:20','12:40','13:00','13:20','13:30']);
  assert.deepEqual(slots('2030-01-14'),[]);assert.deepEqual(slots('2030-01-15'),[]);
  assert.deepEqual(slots(day,{[day]:{lastArrival:'20:00'}}),['18:00','18:20','18:40','19:00','19:20','19:30','19:40','20:00']);
});
test('rolling window checks before and after the requested slot including 19:30',()=>{
  const b=(time,covers)=>({date:day,time,covers,status:'booked'});
  assert.equal(arrivalFits([b('18:00',8)],day,'18:20',5),false);
  assert.equal(arrivalFits([b('18:00',8)],day,'18:40',8),true);
  assert.equal(arrivalFits([b('19:00',4),b('19:20',4)],day,'19:30',5),false);
  assert.equal(arrivalFits([b('18:20',8)],day,'18:00',5),false);
  assert.equal(arrivalFits([b('18:20',8)],day,'18:00',4),true);
});
test('dog table daily cap, party capacity and cancellation release',()=>{
  const s=state();saveBooking(s,input({dogs:true}),null,now);
  assert.equal(s.bookings[0].tableId,1);
  saveBooking(s,input({dogs:true,time:'19:00',covers:6}),null,now);
  assert.equal(s.bookings[1].tableId,2);
  s.overrides[day]={lastArrival:'22:00'};
  assert.equal(availableTables(s,day,'21:00',2,true).length,0);
  s.bookings[0].status='cancelled';assert.equal(availableTables(s,day,'21:00',2,true)[0].id,1);
  assert.equal(availableTables(state(),day,'18:00',7,true).length,0);
});
test('physical tables cannot overlap and release exactly after two hours',()=>{
  const s=state();saveBooking(s,input({tableId:6,covers:4}),null,now);s.overrides[day]={lastArrival:'20:00'};
  assert.equal(availableTables(s,day,'19:20',4,false).some(t=>t.id===6),false);
  assert.equal(availableTables(s,day,'20:00',4,false).some(t=>t.id===6),true);
});
test('editing excludes its own booking but still validates limits',()=>{
  const s=state(),b=saveBooking(s,input(),null,now);
  saveBooking(s,input({name:'Updated Guest',tableId:b.tableId}),b.id,now);
  assert.equal(s.bookings.length,1);assert.equal(s.bookings[0].name,'Updated Guest');
});
test('four-hour cancellation boundary and no-show fee use London time',()=>{
  assert.equal(new Date(arrivalInstant('2030-07-10','18:00')).toISOString(),'2030-07-10T17:00:00.000Z');
  const s=state(),b=saveBooking(s,input({covers:6}),null,now);
  setStatus(s,b.id,'cancelled',new Date('2030-01-09T14:00:00Z'));assert.equal(b.policyChargePence,0);
  const late=state(),lb=saveBooking(late,input({covers:6}),null,now);
  setStatus(late,lb.id,'cancelled',new Date('2030-01-09T14:00:01Z'));assert.equal(lb.policyChargePence,3000);assert.equal(lb.chargeStatus,'review_required');
  const ns=state(),nb=saveBooking(ns,input(),null,now);
  assert.throws(()=>setStatus(ns,nb.id,'no_show',now));setStatus(ns,nb.id,'no_show',new Date('2030-01-09T18:00:00Z'));assert.equal(nb.policyChargePence,1000);
});
test('invalid inputs fail closed',()=>{
  assert.throws(()=>slots('2030-02-30'));
  assert.throws(()=>saveBooking(state(),input({covers:9}),null,now));
  assert.throws(()=>saveBooking(state(),input({dogs:'false'}),null,now));
  assert.throws(()=>saveBooking(state(),input({time:'19:10'}),null,now));
});
test('persistent revision prevents stale saves; lock, audit and backup protect data',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vl-reservations-'));
  try{
    const store=createStore(dir);store.mutate(0,'owner','booking_created',s=>saveBooking(s,input(),null,now));
    assert.throws(()=>store.mutate(0,'owner','booking_created',s=>saveBooking(s,input(),null,now)),/changed/);
    assert.equal(store.read().audit[0].actor,'owner');
    store.mutate(1,'owner','service_updated',s=>{s.overrides[day]={lastArrival:'20:00'};return s.overrides[day];});
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'reservations.json.backup'))).revision,1);
    fs.mkdirSync(path.join(dir,'reservations.lock'));assert.throws(()=>store.mutate(2,'owner','test',()=>({})),/Another booking/);
    fs.rmdirSync(path.join(dir,'reservations.lock'));fs.writeFileSync(path.join(dir,'reservations.json'),'broken');assert.throws(()=>store.read());
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
