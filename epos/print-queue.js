"use strict";
const {randomUUID}=require("node:crypto");
async function enqueueTest(pool,device){
 const id=randomUUID();
 const r=await pool.query(`INSERT INTO epos_print_jobs(id,venue_id,source_device_id,printer_role,job_type,payload)
 VALUES($1,$2,$3,'receipt','test',$4) RETURNING id,status`,
 [id,device.venue_id,device.id,JSON.stringify({siteId:"VL",type:"local-test"})]);
 return r.rows[0];
}
async function claimNext(pool,master){
 const client=await pool.connect();
 try{
  await client.query("BEGIN");
  const r=await client.query(`WITH next AS (
 SELECT j.id FROM epos_print_jobs j
 WHERE j.venue_id=$1 AND j.status='queued'
 ORDER BY j.created_at,j.id FOR UPDATE SKIP LOCKED LIMIT 1
 ) UPDATE epos_print_jobs j SET status='claimed',claimed_at=now(),claimed_by=$2
 FROM next WHERE j.id=next.id
 RETURNING j.id,j.job_type AS "jobType",j.payload`,[master.venue_id,master.id]);
  await client.query("COMMIT");return r.rows[0]||null;
 }catch(e){await client.query("ROLLBACK");throw e}finally{client.release()}
}
async function complete(pool,master,{id,outcome}){
 if(!/^[0-9a-f-]{36}$/i.test(id||"")||!["printed","review"].includes(outcome))throw Error("invalid_acknowledgement");
 const r=await pool.query(`UPDATE epos_print_jobs SET status=$3,completed_at=now()
 WHERE id=$1 AND claimed_by=$2 AND status='claimed'
 RETURNING id,status`,[id,master.id,outcome]);
 if(r.rowCount!==1)throw Error("job_not_claimed_by_master");
 return r.rows[0];
}
module.exports={enqueueTest,claimNext,complete};
