"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {setMaster,getMaster}=require("./master-till");
test("invalid master till is rejected before database writes",async()=>{
 await assert.rejects(setMaster({connect(){throw Error("unexpected")}},"BAD"),/invalid_device/);
});
test("master configuration read returns one site record",async()=>{
 const pool={query:async(sql)=>{assert.match(sql,/epos_site_local_services/);return {rows:[{masterDevice:"TILL-03",printerHost:"192.168.0.175",printerPort:9100}]}}};
 assert.equal((await getMaster(pool)).masterDevice,"TILL-03");
});
