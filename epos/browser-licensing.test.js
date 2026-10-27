"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {validate}=require("./site-licensing");
test("same logical device ID is validated independently of browser tab",()=>{
 for(let i=0;i<5;i++)assert.doesNotThrow(()=>validate({siteId:"VL",deviceId:"TILL-03",deviceType:"till"}));
});
test("different IDs and invalid device types cannot impersonate a registered till",()=>{
 assert.throws(()=>validate({siteId:"VL",deviceId:"TILL-03",deviceType:"phone"}),/invalid_device_details/);
});
