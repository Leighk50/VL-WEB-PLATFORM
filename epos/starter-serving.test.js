"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {validatedLines}=require("./shared-till");
const catalogue={wet:[{id:"beer",name:"Beer",category:"Draught",available:true,measures:{Pint:500}}],food:[{id:"soup",name:"Soup",category:"Starters",available:true,measures:{Standard:850}}]};
const line=(servingOption)=>[{productId:"soup",measure:"Standard",quantity:1,servingOption}];
test("starter serving choice keeps normal price for mains timing",()=>{
 assert.equal(validatedLines(catalogue,line("starter"))[0].unitPricePence,850);
 assert.equal(validatedLines(catalogue,line("with_mains"))[0].unitPricePence,850);
});
test("main portion doubles starter price on server",()=>{
 const result=validatedLines(catalogue,line("main_portion"))[0];
 assert.equal(result.unitPricePence,1700);assert.equal(result.servingOption,"main_portion");
});
test("nonstarter cannot claim main portion",()=>{
 assert.throws(()=>validatedLines(catalogue,[{productId:"beer",measure:"Pint",quantity:1,servingOption:"main_portion"}]),/Invalid serving option/);
});
