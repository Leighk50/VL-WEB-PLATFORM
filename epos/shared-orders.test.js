"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {openTable,addOrder}=require("./shared-orders");
test("rejects invalid table without database write",async()=>{
 let touched=false;const pool={connect(){touched=true;throw Error("unexpected")}};
 await assert.rejects(openTable(pool,{tableId:0}),/Invalid table/);assert.equal(touched,false);
});
test("rejects order without explicit tab before database write",async()=>{
 let touched=false;const pool={connect(){touched=true;throw Error("unexpected")}};
 await assert.rejects(addOrder(pool,{sessionId:"123e4567-e89b-12d3-a456-426614174000",tabId:"",deviceId:"123e4567-e89b-12d3-a456-426614174001",requestId:"123e4567-e89b-12d3-a456-426614174002",lines:[{productId:"1",name:"Test",quantity:1,unitPricePence:100}]}),/Invalid identifiers/);
 assert.equal(touched,false);
});
test("rejects invalid prices and quantities",async()=>{
 const ids={sessionId:"123e4567-e89b-12d3-a456-426614174000",tabId:"123e4567-e89b-12d3-a456-426614174001",deviceId:"123e4567-e89b-12d3-a456-426614174002",requestId:"123e4567-e89b-12d3-a456-426614174003"};
 await assert.rejects(addOrder({connect(){throw Error("unexpected")}}, {...ids,lines:[{productId:"1",name:"Test",quantity:1,unitPricePence:-1}]}),/Invalid line/);
});
