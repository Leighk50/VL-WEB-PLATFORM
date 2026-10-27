"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {validate,register}=require("./site-licensing");
test("registration requires valid site, till ID and type",()=>{
 assert.doesNotThrow(()=>validate({siteId:"VL",deviceId:"TILL-03",deviceType:"till"}));
 for(const input of [{siteId:"OTHER",deviceId:"TILL-03",deviceType:"till"},{siteId:"VL",deviceId:"TILL-03",deviceType:"phone"},{siteId:"VL",deviceId:"BAD",deviceType:"till"}])assert.throws(()=>validate(input),/invalid_device_details/);
});
test("invalid registration does not reach database",async()=>{
 await assert.rejects(register({connect(){throw Error("unexpected database call")}}, {siteId:"BAD",deviceId:"TILL-03",deviceType:"till"}),/invalid_device_details/);
});
