"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {listDevices,renewPaidLicences}=require("./site-licensing");
test("site inventory counts active devices only once, not tabs",async()=>{
 let n=0;const pool={query:async(sql)=>{n++;return n===1?{rows:[{deviceId:"TILL-03",deviceType:"till",active:true},{deviceId:"TILL-02",deviceType:"till",active:false}]}:{rowCount:1,rows:[{maxTills:3,paidThrough:"2026-12-01"}]}}};
 const result=await listDevices(pool,"VL");assert.equal(result.used,1);assert.equal(result.available,2);
});
test("renewal never changes site paid-through and is bounded to it",async()=>{
 const pool={query:async(sql)=>{assert.match(sql,/LEAST\(now\(\)\+interval '35 days',s.paid_through\)/);assert.doesNotMatch(sql,/SET paid_through/);return {rowCount:2}}};
 assert.deepEqual(await renewPaidLicences(pool,"VL"),{renewed:2});
});
