'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const {activeWelcome,checkoutTime}=require('./hotel-tv-guests');
function booking(first,checkin,checkout,room=1){return {room,first,last:'Guest',checkin,checkout};}
test('Weekday back-to-back bookings retain outgoing name through midnight and hand over exactly at 10am UK',()=>{
 const out=booking('Outgoing','2026-10-18','2026-10-19'),incoming=booking('Incoming','2026-10-19','2026-10-20');const list=[out,incoming];
 const before=activeWelcome(list,1,new Date('2026-10-18T22:59:59Z'));assert.equal(before.name,'Outgoing Guest');assert.equal(before.isCheckoutDay,false);assert.equal(before.checkoutMessage,'');
 for(const at of ['2026-10-18T23:00:00Z','2026-10-19T00:00:00Z','2026-10-19T08:59:59.999Z']){const w=activeWelcome(list,1,new Date(at));assert.equal(w.name,'Outgoing Guest');assert.equal(w.isCheckoutDay,true);assert.equal(w.checkoutLabel,'10am');assert.match(w.checkoutMessage,/Thank you for staying at The Village Limits/);assert.match(w.checkoutMessage,/leave your keys in your room and close the door behind you/);}
 const next=activeWelcome(list,1,new Date('2026-10-19T09:00:00Z'));assert.equal(next.name,'Incoming Guest');assert.equal(next.isCheckoutDay,false);assert.equal(next.checkoutMessage,'');
 assert.equal(activeWelcome([incoming],1,new Date('2026-10-19T08:59:59Z')),null);assert.equal(activeWelcome([out],1,new Date('2026-10-19T09:00:00Z')),null);
});
test('Saturday and Sunday departures retain name until 11am; UK DST and winter cutoffs remain correct',()=>{
 for(const [day,start,cutoff] of [['2026-10-17','2026-10-16','2026-10-17T10:00:00Z'],['2026-10-18','2026-10-17','2026-10-18T10:00:00Z'],['2026-10-25','2026-10-24','2026-10-25T11:00:00Z'],['2026-11-02','2026-11-01','2026-11-02T10:00:00Z']]){
 const nextDay=new Date(Date.parse(day+'T12:00:00Z')+86400000).toISOString().slice(0,10);const old=booking('Outgoing',start,day),incoming=booking('Incoming',day,nextDay);const before=activeWelcome([old,incoming],1,new Date(Date.parse(cutoff)-1));assert.equal(before.name,'Outgoing Guest');assert.equal(before.isCheckoutDay,true);assert.equal(before.checkoutLabel,day==='2026-11-02'?'10am':'11am');assert.equal(activeWelcome([old,incoming],1,new Date(cutoff)).name,'Incoming Guest');assert.equal(Date.parse(checkoutTime(day)),Date.parse(cutoff));
 }
});
test('Conflicting active bookings remain generic and names never cross rooms',()=>{
 const a=booking('First','2026-10-16','2026-10-19'),b=booking('Other','2026-10-16','2026-10-19');assert.equal(activeWelcome([a,b],1,new Date('2026-10-17T08:00:00Z')),null);assert.equal(activeWelcome([a],2,new Date('2026-10-17T08:00:00Z')),null);
});
test('Client only shows departure text for a valid active departure welcome',()=>{
 const s=fs.readFileSync(path.join(__dirname,'hotel-tv-client/tv.js'),'utf8'),start=s.indexOf('function departureMessage('),end=s.indexOf('function renderRoomSetup(){',start);const ctx={Date:{now:()=>Date.parse('2026-10-19T08:00:00Z'),parse:Date.parse}};vm.createContext(ctx);vm.runInContext(s.slice(start,end),ctx);const value={expiresAt:'2026-10-19T09:00:00Z',isCheckoutDay:true,checkoutMessage:'Thank you. Checkout by 10am.'};assert.equal(ctx.departureMessage(value),value.checkoutMessage);assert.equal(ctx.departureMessage({...value,isCheckoutDay:false}),'');assert.equal(ctx.departureMessage({...value,expiresAt:'2026-10-19T08:00:00Z'}),'');assert.equal(ctx.departureMessage(null),'');assert.equal(ctx.departureMessage({...value,checkoutMessage:'x'.repeat(501)}),'');
});
