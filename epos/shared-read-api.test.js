"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {authenticated,getTableSnapshot}=require("./shared-read-api");
test("rejects requests without a strong configured key",()=>{
 assert.equal(authenticated({headers:{"x-epos-staging-key":"abc"}},"abc"),false);
 assert.equal(authenticated({headers:{}},"a".repeat(48)),false);
 assert.equal(authenticated({headers:{"x-epos-staging-key":"b".repeat(48)}},"a".repeat(48)),false);
 assert.equal(authenticated({headers:{"x-epos-staging-key":"a".repeat(48)}},"a".repeat(48)),true);
});
test("returns database snapshot rows without modifying them",async()=>{
 let called=0;
 const rows=[{table_number:1,session_id:null,tabs:[]}];
 const pool={query:async(sql)=>{called++;assert.match(sql,/FROM epos_tables t/);return {rows}}};
 assert.deepEqual(await getTableSnapshot(pool),rows);assert.equal(called,1);
});
