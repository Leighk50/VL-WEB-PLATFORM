"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {digest,generateDeviceToken,authenticateDevice}=require("./device-auth");
test("tokens are strong, hashed, and never accepted without a registered device",async()=>{
 const token=generateDeviceToken();
 assert.match(token,/^[A-Za-z0-9_-]{43}$/);
 assert.equal(digest(token).length,64);
 assert.notEqual(digest(token),token);
 const pool={query:async(sql,params)=>{assert.match(sql,/enabled=true/);assert.deepEqual(params,[digest(token)]);return {rows:[]}}};
 assert.equal(await authenticateDevice(pool,{headers:{authorization:"Bearer "+token}}),null);
});
test("invalid device tokens never query database",async()=>{
 const pool={query(){throw Error("should not query")}};
 assert.equal(await authenticateDevice(pool,{headers:{}}),null);
 assert.equal(await authenticateDevice(pool,{headers:{authorization:"Bearer weak"}}),null);
});
