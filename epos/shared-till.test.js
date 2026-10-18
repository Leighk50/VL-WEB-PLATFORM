"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {validatedLines}=require("./shared-till");
const catalogue={wet:[{id:"wet-1",name:"Moretti",available:true,measures:{Pint:600,Half:320}}],food:[]};
test("prices always come from server catalogue, not till",()=>{
 assert.deepEqual(validatedLines(catalogue,[{productId:"wet-1",measure:"Pint",quantity:1,unitPricePence:1}]),[{productId:"wet-1",name:"Moretti · Pint",quantity:1,unitPricePence:600,modifiers:[],instructions:""}]);
});
test("unavailable or unsupported measures are rejected",()=>{
 assert.throws(()=>validatedLines(catalogue,[{productId:"wet-1",measure:"Bottle",quantity:1}]),/Invalid measure/);
 assert.throws(()=>validatedLines(catalogue,[{productId:"wet-2",measure:"Pint",quantity:1}]),/unavailable/);
 assert.throws(()=>validatedLines(catalogue,[{productId:"wet-1",measure:"Pint",quantity:1,modifiers:["free tonic"]}]),/Modifiers not enabled/);
});
