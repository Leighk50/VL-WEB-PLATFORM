"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {enqueueTest,claimNext,complete}=require("./print-queue");
test("new jobs are queued with a server generated ID",async()=>{
 const pool={query:async(sql,args)=>{assert.match(sql,/INSERT INTO epos_print_jobs/);assert.equal(args[1],"venue");assert.equal(args[2],"device");return {rows:[{id:args[0],status:"queued"}]}}};
 const result=await enqueueTest(pool,{venue_id:"venue",id:"device"});assert.equal(result.status,"queued");
});
test("claim is atomic and uses skip locked",async()=>{
 const pool={connect:async()=>({query:async(sql)=>{if(sql.includes("SKIP LOCKED")){assert.match(sql,/status='queued'/);return {rows:[]}}return {rows:[]}},release(){}})};
 assert.equal(await claimNext(pool,{venue_id:"v",id:"d"}),null);
});
test("completion rejects invalid outcome before database write",async()=>{
 await assert.rejects(complete({query(){throw Error("not expected")}}, {id:"d"},{id:"abc",outcome:"printed"}),/invalid_acknowledgement/);
});
