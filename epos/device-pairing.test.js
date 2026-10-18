"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {pairingCode,startPairing,redeemPairing}=require("./device-pairing");
test("pairing codes are 96-bit, unpredictable and URL safe",()=>{
 const a=pairingCode(),b=pairingCode();assert.match(a,/^[A-Za-z0-9_-]{16}$/);assert.notEqual(a,b);
});
test("invalid device identifiers fail before any SQL",async()=>{
 const pool={connect(){throw Error("unexpected SQL")}};
 await assert.rejects(startPairing(pool,{deviceCode:"",kind:"till",name:"Test"}),/Invalid/);
 await assert.rejects(redeemPairing(pool,"123"),/Invalid/);
});
