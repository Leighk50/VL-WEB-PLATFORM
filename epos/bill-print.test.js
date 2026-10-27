"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {buildBill}=require("./bill-print");
test("bill totals reflect server quantities and integer pence",()=>{
 const s={sessionId:"session",tabs:[{id:"a",label:"Tab 1",items:[{name:"Coffee",quantity:2,pricePence:350},{name:"Tea",quantity:1,pricePence:275}]},{id:"b",label:"Tab 2",items:[{name:"Cake",quantity:1,pricePence:425}]}]};
 assert.equal(buildBill(s,6).totalPence,1400);
 assert.equal(buildBill(s,6,"a").totalPence,975);
 assert.equal(buildBill(s,6).paymentStatus,"UNPAID");
 assert.throws(()=>buildBill(s,6,"bad"),/tab_not_found/);
});
