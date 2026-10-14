"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const catalogue=require("./catalogue-import.json");
test("all exported wet PLUs and repository menu food records are retained",()=>{
 assert.equal(catalogue.wet.length,301);
 assert.equal(catalogue.food.length,42);
 assert.equal(new Set(catalogue.wet.map(p=>p.plu)).size,301);
});
test("draught measures and mixer prices match ICR Touch export",()=>{
 const byPLU=new Map(catalogue.wet.map(p=>[p.plu,p]));
 assert.deepEqual(byPLU.get("1").measures,{Pint:600,Half:320});
 for(const [plu,price] of [["900",275],["906",275],["907",275],["909",275],["916",275],["805",70],["836",50],["812",100]])
   assert.equal(byPLU.get(plu).priceLevelsPence[0],price,plu);
});
test("175ml wines are not available and bottle-only wines remain bottle products",()=>{
 for(const p of catalogue.wet.filter(p=>/175\s*ML/i.test(p.name)))assert.equal(p.available,false);
 assert.equal(catalogue.wet.find(p=>p.plu==="1004").measures.Bottle,2600);
});
test("zero and suspicious prices are flagged rather than sold as free",()=>{
 for(const p of catalogue.wet.filter(p=>p.available)){
   assert.ok(Object.values(p.measures).some(v=>v>0),p.plu);
 }
 assert.equal(catalogue.wet.find(p=>p.plu==="1409").available,false);
});
