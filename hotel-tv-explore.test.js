'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {parseListings,cinemaResult,ukDate}=require('./hotel-tv-explore');
test('Kinema structured listings decode titles, group times and deduplicate performances',()=>{
 const html='<option value="Film42">A &amp; B</option><option class="Film42 Day20261012" value="Booking?a">Mon Oct 12 @ 12:30pm</option><option class="Film42 Day20261012">Mon Oct 12 @ 12:30pm</option><option class="Film42 Day20261012">Mon Oct 12 @ 9:05am</option><option class="Film42 Day20261013">Tue Oct 13 @ 12:00am</option>';
 const items=parseListings(html);assert.equal(items.length,3);assert.equal(items[0].time,'09:05');assert.equal(items[2].time,'00:00');
 const now=new Date('2026-10-12T10:00:00Z'),out=cinemaResult({items,updatedAt:now.toISOString()},now);assert.equal(out.days[0].films[0].title,'A & B');assert.deepEqual(out.days[0].films[0].times,['09:05','12:30']);assert.equal(out.days[1].films[0].times[0],'00:00');
});
test('UK midnight and stale cache never show another day or outdated listings',()=>{const now=new Date('2026-10-12T23:10:00Z');assert.equal(ukDate(now),'2026-10-13');const out=cinemaResult({items:[{id:'1',title:'Old film',date:'2026-10-13',time:'12:00'}],updatedAt:'2026-10-12T20:00:00Z'},now);assert.equal(out.status,'unavailable');assert(out.days.every(d=>d.films.length===0));assert.equal(out.updatedAt,null);});
test('Unknown Kinema layout fails closed',()=>assert.throws(()=>parseListings('<html>No listings</html>')));
test('Every attraction has an official HTTPS destination and a bundled QR code',()=>{const places=require('./hotel-tv-attractions.json');assert.equal(new Set(places.map(p=>p.id)).size,places.length);assert(places.some(p=>p.id==='ibcc'));assert(places.some(p=>p.id==='kirkby'));for(const p of places){assert(p.url.startsWith('https://'));assert(p.qr.startsWith('data:image/png;base64,'));assert(['village','aviation','days'].includes(p.category));}});
