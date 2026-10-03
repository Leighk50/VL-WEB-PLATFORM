'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),os=require('os'),http=require('http');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vl-reservation-api-'));
process.env.CONTENT_DATA_DIR=dir;
const {handleReservations}=require('./reservations-api');
test('staff API enforces authentication, permissions, revisions, capacity and service exceptions',async()=>{
  const server=http.createServer((req,res)=>handleReservations(req,res,req.headers['x-test-user']==='owner'?{username:'owner',isOwner:true}:req.headers['x-test-user']==='limited'?{username:'limited',permissions:['menus']} :null,new URL(req.url,'http://localhost')));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  async function call(route,method='GET',data,user='owner',extra={}){
    const r=await fetch(base+route,{method,headers:{'Content-Type':'application/json','x-test-user':user,...extra},body:data?JSON.stringify(data):undefined});return {status:r.status,data:await r.json()};
  }
  try{
    const route='/api/admin/reservations?date=2030-01-09';
    assert.equal((await call(route,'GET',null,'none')).status,401);
    assert.equal((await call(route,'GET',null,'limited')).status,403);
    assert.equal((await call(route)).data.bookings.length,0);
    const b={date:'2030-01-09',time:'18:00',covers:6,dogs:true,name:'API Guest',phone:'01234567890',revision:0};
    assert.equal((await call('/api/admin/reservations','POST',b,'owner',{Origin:'https://evil.example'})).status,403);
    const saved=await call('/api/admin/reservations','POST',b);assert.equal(saved.status,200);assert.equal(saved.data.result.tableId,2);
    assert.equal((await call('/api/admin/reservations','POST',b)).status,409);
    assert.equal((await call('/api/admin/reservations','POST',{...b,revision:1,time:'19:00'})).status,409);
    assert.equal((await call('/api/admin/reservations/service','PUT',{date:b.date,lastArrival:'20:00',closed:false,revision:1})).status,200);
    assert.equal((await call(route)).data.slots.at(-1),'20:00');
    assert.equal((await call('/api/admin/reservations/service','PUT',{date:b.date,lastArrival:'20:00',closed:true,revision:2})).status,409);
    const cancel=await call('/api/admin/reservations/'+saved.data.result.id+'/status','PUT',{status:'cancelled',revision:2});assert.equal(cancel.status,200);
    assert.equal((await call('/api/admin/reservations/service','PUT',{date:b.date,lastArrival:'20:00',closed:true,revision:3})).status,200);
    assert.deepEqual((await call(route)).data.slots,[]);
    assert.equal(fs.existsSync(path.join(dir,'content.json')),false);
  }finally{await new Promise(resolve=>server.close(resolve));fs.rmSync(dir,{recursive:true,force:true});}
});
