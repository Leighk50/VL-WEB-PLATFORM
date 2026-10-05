'use strict';
const path=require('path');
const {TABLES,RULES,ReservationError,dateValid,minute,slots,arrivalInstant,availableTables,createStore,saveBooking,setStatus}=require('./reservations');
const DATA_DIR=process.env.CONTENT_DATA_DIR||(process.env.HOME?path.join(process.env.HOME,'site','data'):path.join(__dirname,'data'));
const store=createStore(DATA_DIR);
function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));}
async function body(req){
  if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw new ReservationError('JSON request required.',415);
  let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>20000)throw new ReservationError('Request too large.',413);}
  try{return JSON.parse(raw);}catch{throw new ReservationError('Invalid JSON request.');}
}
async function handleReservations(req,res,identity,url){
  if(!identity){json(res,401,{error:'Please sign in again.'});return true;}
  if(!identity.isOwner&&!identity.permissions.includes('reservations')){json(res,403,{error:'Reservations access is required.'});return true;}
  try {
    const pathname=url.pathname;
    if(req.method==='GET'&&pathname==='/api/admin/reservations'){
      const date=url.searchParams.get('date');if(!dateValid(date))throw new ReservationError('Choose a valid date.');
      const state=store.read();
      json(res,200,{revision:state.revision,bookings:state.bookings.filter(b=>b.date===date).sort((a,b)=>a.time.localeCompare(b.time)),tables:TABLES,rules:RULES,slots:slots(date,state.overrides),override:state.overrides[date]||null,openDays:state.overrides._openDays||[0,3,4,5,6],blockedDates:Object.entries(state.overrides).filter(([d,v])=>dateValid(d)&&v.closed).map(([date])=>date).sort(),cardCollectionEnabled:false});return true;
    }
    if(req.method==='GET'&&pathname==='/api/admin/reservations/availability'){
      const date=url.searchParams.get('date'),covers=Number(url.searchParams.get('covers')),dogs=url.searchParams.get('dogs')==='true';
      if(!Number.isInteger(covers)||covers<1||covers>8)throw new ReservationError('Choose 1–8 guests.');
      const state=store.read();json(res,200,{slots:slots(date,state.overrides).filter(time=>arrivalInstant(date,time)>Date.now()).map(time=>({time,tables:availableTables(state,date,time,covers,dogs,url.searchParams.get('ignoreId'))}))});return true;
    }
    // JSON-only requests and Origin checks protect cookie-authenticated mutations.
    if(req.method!=='GET'){
      const origin=req.headers.origin;
      if(req.headers['sec-fetch-site']==='cross-site'||(origin&&new URL(origin).host!==req.headers.host))throw new ReservationError('Cross-site request rejected.',403);
    }
    const input=await body(req),revision=input.revision;
    let action,change;
    if(pathname==='/api/admin/reservations/open-days'&&req.method==='PUT'){
      if(!Array.isArray(input.openDays)||input.openDays.some(d=>!Number.isInteger(d)||d<0||d>6)||new Set(input.openDays).size!==input.openDays.length)throw new ReservationError('Choose valid opening days.');
      action='opening_days_updated';change=state=>{state.overrides._openDays=input.openDays;return {openDays:input.openDays};};
    }else if(pathname==='/api/admin/reservations/block-date'&&req.method==='PUT'){
      if(!dateValid(input.date)||typeof input.closed!=='boolean')throw new ReservationError('Choose a valid date and closure status.');
      action='date_block_updated';change=state=>{state.overrides[input.date]={...state.overrides[input.date],closed:input.closed};return {date:input.date,closed:input.closed};};
    }else if(pathname==='/api/admin/reservations/service'&&req.method==='PUT'){
      action='service_updated';
      if(!dateValid(input.date))throw new ReservationError('Choose a valid date.');
      const normal=slots(input.date,{_openDays:store.read().overrides._openDays});if(!normal.length)throw new ReservationError('This weekday is closed in the standard opening schedule.');
      if(typeof input.closed!=='boolean')throw new ReservationError('Specify whether the service is closed.');
      const end=minute(input.lastArrival);
      if(end<minute(normal.at(-1))||end>(normal[0]==='12:00'?16*60:23*60))throw new ReservationError('Choose a last arrival from the normal cutoff to 16:00 on Sunday or 23:00 in the evening.');
      change=state=>{
        const override={closed:input.closed,lastArrival:input.lastArrival};
        const future={...state.overrides,[input.date]:override};
        if(state.bookings.some(b=>b.date===input.date&&b.status!=='cancelled'&&!slots(input.date,future).includes(b.time)))throw new ReservationError('Existing bookings would be outside these service times. Move or cancel them first.',409);
        state.overrides[input.date]=override;return {date:input.date,...override};
      };
    }else if(pathname==='/api/admin/reservations'&&req.method==='POST'){
      action='booking_created';change=state=>saveBooking(state,input);
    }else{
      const match=pathname.match(/^\/api\/admin\/reservations\/([a-f0-9-]+)(\/status)?$/);
      if(!match||req.method!=='PUT'){json(res,405,{error:'Method not allowed.'});return true;}
      action=match[2]?'status_updated':'booking_updated';
      change=state=>match[2]?setStatus(state,match[1],input.status):saveBooking(state,input,match[1]);
    }
    const result=store.mutate(revision,identity.username,action,change);
    json(res,200,{ok:true,...result});
  }catch(e){
    if(!(e instanceof ReservationError))console.error('Reservations request failed',e);
    json(res,e.status||500,{error:e instanceof ReservationError?e.message:'Reservation records could not be saved or loaded. Contact the administrator.'});
  }
  return true;
}
module.exports={handleReservations};
