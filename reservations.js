'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const TABLES = [
  {id:1,capacity:2,dogs:true},{id:2,capacity:6,dogs:true},
  ...[[3,3],[4,2],[5,2],[6,4],[7,8],[8,6],[9,6],[10,2],[11,2]].map(([id,capacity])=>({id,capacity,dogs:false}))
];
const RULES = {durationMinutes:120,intervalMinutes:20,arrivalWindowMinutes:40,maxArrivals:12,chargePerCoverPence:500,cancellationNoticeHours:4};
class ReservationError extends Error { constructor(message,status=400) { super(message); this.status=status; } }
function dateValid(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = new Date(date+'T12:00:00Z');
  return !Number.isNaN(+d) && d.toISOString().slice(0,10) === date;
}
function minute(time) {
  if (typeof time !== 'string' || !/^\d{2}:\d{2}$/.test(time)) throw new ReservationError('Use a time such as 18:20.');
  const [h,m]=time.split(':').map(Number);
  if(h>23||m>59)throw new ReservationError('Invalid arrival time.');
  return h*60+m;
}
function clock(n) { return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0'); }
function slots(date,overrides={}) {
  if(!dateValid(date)) throw new ReservationError('Choose a valid date.');
  const day=new Date(date+'T12:00:00Z').getUTCDay();
  if(!(overrides._openDays||[0,3,4,5,6]).includes(day)) return [];
  const start=day===0?720:1080, normalLast=start+90;
  const override=overrides[date];
  if(override?.closed) return [];
  const last=override?.lastArrival?minute(override.lastArrival):normalLast;
  const result=[];
  for(let t=start;t<=last;t+=20)result.push(clock(t));
  // Preserve the normal extra final slot even when the service is extended.
  if(last>=normalLast)result.push(clock(normalLast));
  result.push(clock(last));
  return [...new Set(result)].sort();
}
function londonNow(now=new Date()) {
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}
function arrivalInstant(date,time) {
  const guess=Date.parse(date+'T'+time+':00Z');
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(guess));
  const local=Number(parts.find(x=>x.type==='hour').value)*60+Number(parts.find(x=>x.type==='minute').value);
  let offset=local-minute(time); if(offset< -720)offset+=1440;if(offset>720)offset-=1440;
  return guess-offset*60000;
}
function validateBooking(input,now=new Date()) {
  if(!dateValid(input.date))throw new ReservationError('Choose a valid date.');
  const time=clock(minute(input.time));
  if(arrivalInstant(input.date,time)<=+now)throw new ReservationError('Choose a future arrival time.');
  const covers=Number(input.covers);
  if(!Number.isInteger(covers)||covers<1||covers>8)throw new ReservationError('Bookings must be for 1–8 guests. Contact the venue about larger parties.');
  if(typeof input.dogs!=='boolean')throw new ReservationError('Specify whether the guest is bringing a dog.');
  const name=String(input.name||'').trim(),phone=String(input.phone||'').trim(),email=String(input.email||'').trim();
  if(name.length<2||name.length>100||phone.length<5||phone.length>40||email.length>160||(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))throw new ReservationError('Enter a guest name, phone number and valid email if supplied.');
  const notes=String(input.notes||'').trim();if(notes.length>2000)throw new ReservationError('Notes must be no longer than 2,000 characters.');
  return {date:input.date,time,covers,dogs:input.dogs,name,phone,email,notes};
}
function active(b) { return b.status!=='cancelled'; }
function arrivalFits(bookings,date,time,covers) {
  const times=bookings.filter(b=>b.date===date&&active(b)).map(b=>({time:minute(b.time),covers:b.covers}));
  times.push({time:minute(time),covers});
  // Half-open windows: exactly 40 minutes apart belong to different windows.
  return times.every(start=>times.filter(x=>x.time>=start.time&&x.time<start.time+40).reduce((n,x)=>n+x.covers,0)<=12);
}
function availableTables(state,date,time,covers,dogs,ignoreId) {
  if(!slots(date,state.overrides).includes(time)) return [];
  const bookings=state.bookings.filter(b=>b.id!==ignoreId);
  if(!arrivalFits(bookings,date,time,covers))return [];
  const t=minute(time);
  return TABLES.filter(table=>table.capacity>=covers&&(!dogs||table.dogs))
    .filter(table=>!bookings.some(b=>b.date===date&&active(b)&&b.tableId===table.id&&((dogs&&b.dogs)||(t<minute(b.time)+120&&t+120>minute(b.time)))))
    .sort((a,b)=>(dogs?0:Number(a.dogs)-Number(b.dogs))||a.capacity-b.capacity||a.id-b.id);
}
function createStore(dir) {
  const file=path.join(dir,'reservations.json'),lock=path.join(dir,'reservations.lock');
  function read() {
    try { const s=JSON.parse(fs.readFileSync(file,'utf8'));if(s.version!==1||!Array.isArray(s.bookings)||!s.overrides||!Array.isArray(s.audit))throw new Error('Invalid reservation storage');return s; }
    catch(e) {if(e.code==='ENOENT')return {version:1,revision:0,bookings:[],overrides:{},audit:[]};throw e;}
  }
  function mutate(expected,actor,action,change) {
    fs.mkdirSync(dir,{recursive:true});
    try {fs.mkdirSync(lock);}catch(e){if(e.code==='EEXIST')throw new ReservationError('Another booking is being saved. Reload and try again.',409);throw e;}
    try {
      const state=read();
      if(expected!==state.revision)throw new ReservationError('Bookings changed since you loaded them. Reload before saving.',409);
      const result=change(state);state.revision++;
      state.audit.push({at:new Date().toISOString(),actor,action,record:structuredClone(result)});
      if(fs.existsSync(file))fs.copyFileSync(file,file+'.backup');
      const temp=file+'.'+crypto.randomUUID()+'.tmp';
      const fd=fs.openSync(temp,'wx',0o600);
      try {fs.writeFileSync(fd,JSON.stringify(state,null,2));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
      fs.renameSync(temp,file);
      return {revision:state.revision,result};
    } finally {fs.rmdirSync(lock);}
  }
  return {read,mutate};
}
function saveBooking(state,input,id,now=new Date()) {
  const details=validateBooking(input,now);
  const existing=id?state.bookings.find(x=>x.id===id):null;
  if(id&&!existing)throw new ReservationError('Booking not found.',404);
  if(existing&&existing.status!=='booked')throw new ReservationError('Only upcoming booked reservations can be edited.');
  const choices=availableTables(state,details.date,details.time,details.covers,details.dogs,id);
  const table=input.tableId?choices.find(x=>x.id===Number(input.tableId)):choices[0];
  if(!table)throw new ReservationError('No suitable table is available within the arrival and dog-booking limits.',409);
  const booking={...existing,...details,id:existing?.id||crypto.randomUUID(),tableId:table.id,status:'booked',cardStatus:'not_collected',updatedAt:new Date().toISOString()};
  if(!existing){booking.createdAt=booking.updatedAt;state.bookings.push(booking);}else state.bookings[state.bookings.indexOf(existing)]=booking;
  return booking;
}
function setStatus(state,id,status,now=new Date()) {
  const b=state.bookings.find(x=>x.id===id);if(!b)throw new ReservationError('Booking not found.',404);
  const transitions={booked:['arrived','cancelled','no_show'],arrived:['completed'],completed:[],cancelled:[],no_show:[]};
  if(!transitions[b.status]?.includes(status))throw new ReservationError('This booking status cannot be changed that way.');
  if(['arrived','no_show','completed'].includes(status)&&arrivalInstant(b.date,b.time)>+now)throw new ReservationError('Arrival and no-show status can only be recorded from the booking time.');
  b.status=status;b.updatedAt=now.toISOString();
  if(status==='cancelled'||status==='no_show') {
    b.cancelledAt=status==='cancelled'?now.toISOString():null;
    const late=status==='no_show'||arrivalInstant(b.date,b.time)-+now<4*3600000;
    b.policyChargePence=late?b.covers*500:0;
    b.chargeStatus=late?'review_required':'not_applicable';
  }
  return b;
}
module.exports={TABLES,RULES,ReservationError,dateValid,minute,slots,londonNow,arrivalInstant,arrivalFits,availableTables,createStore,saveBooking,setStatus};
