"use strict";
const {randomUUID,randomBytes,createHash}=require("node:crypto");
const {validate,register}=require("./site-licensing");
const hash=s=>createHash("sha256").update(s).digest("hex");
async function request(pool,input){
 validate(input);
 const claim=randomBytes(32).toString("base64url"),id=randomUUID();
 const result=await pool.query(`INSERT INTO epos_licence_requests(id,venue_id,device_code,device_type,claim_hash,expires_at)
 SELECT $1,id,$2,'till',$3,now()+interval '10 minutes' FROM epos_venues WHERE code=$4 RETURNING id`,[id,input.deviceId,hash(claim),input.siteId]);
 if(result.rowCount!==1)throw Error("unknown_site");
 return {requestId:id,claim,expiresInSeconds:600};
}
async function list(pool){
 const r=await pool.query(`SELECT r.id,r.device_code AS "deviceId",r.device_type AS "deviceType",r.created_at AS "requestedAt"
 FROM epos_licence_requests r JOIN epos_venues v ON v.id=r.venue_id
 WHERE v.code='VL' AND r.status='pending' AND r.expires_at>now() ORDER BY r.created_at LIMIT 30`);
 return r.rows;
}
async function approve(pool,id){
 if(!/^[a-f0-9-]{36}$/i.test(id))throw Error("invalid_request");
 const r=await pool.query(`UPDATE epos_licence_requests SET status='approved',approved_at=now()
 WHERE id=$1 AND status='pending' AND expires_at>now() RETURNING id`,[id]);
 if(r.rowCount!==1)throw Error("request_expired");
 return {approved:true};
}
async function claim(pool,{requestId,claim}){
 if(!/^[a-f0-9-]{36}$/i.test(requestId||"")||! /^[A-Za-z0-9_-]{43}$/.test(claim||""))throw Error("invalid_request");
 const client=await pool.connect();
 try{
  await client.query("BEGIN");
  const r=await client.query(`SELECT r.device_code,r.device_type,v.code AS site
 FROM epos_licence_requests r JOIN epos_venues v ON v.id=r.venue_id
 WHERE r.id=$1 AND r.claim_hash=$2 AND r.expires_at>now() AND r.status IN ('pending','approved') FOR UPDATE OF r`,[requestId,hash(claim)]);
  if(r.rowCount!==1)throw Error("not_approved_or_expired");
  // A valid claim triggers automatic entitlement validation in register().
  // Existing device credentials are never replaced by this request.
  const data=r.rows[0];
  const result=await register(pool,{siteId:data.site,deviceId:data.device_code,deviceType:data.device_type});
  await client.query("UPDATE epos_licence_requests SET status='claimed' WHERE id=$1",[requestId]);
  await client.query("COMMIT");return result;
 }catch(e){await client.query("ROLLBACK");throw e}finally{client.release()}
}
module.exports={request,list,approve,claim};
