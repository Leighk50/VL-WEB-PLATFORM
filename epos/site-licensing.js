"use strict";
const {randomUUID,randomBytes,createHash}=require("node:crypto");
const hash=token=>createHash("sha256").update(token).digest("hex");
const allowedTypes=new Set(["till"]);
function validate(input){
 if(input.siteId!=="VL"||!/^TILL-[0-9]{2}$/.test(input.deviceId)||!allowedTypes.has(input.deviceType))throw Error("invalid_device_details");
}
async function register(pool,input){
 validate(input);
 const client=await pool.connect();
 try{
  await client.query("BEGIN");
  const v=await client.query("SELECT id FROM epos_venues WHERE code=$1",["VL"]);
  if(v.rowCount!==1)throw Error("unknown_site");
  const venueId=v.rows[0].id;
  const entitlement=await client.query("SELECT max_tills,paid_through FROM epos_site_licences WHERE venue_id=$1 FOR UPDATE",[venueId]);
  if(entitlement.rowCount!==1||!entitlement.rows[0].paid_through||new Date(entitlement.rows[0].paid_through)<=new Date())throw Error("site_licence_unpaid");
  const existing=await client.query("SELECT id,token_hash FROM epos_devices WHERE venue_id=$1 AND code=$2 FOR UPDATE",[venueId,input.deviceId]);
  // A previously registered device must be explicitly de-registered before replacement.
  if(existing.rowCount&&existing.rows[0].token_hash)throw Error("device_already_registered");
  const count=await client.query(`SELECT count(*)::integer AS n FROM epos_device_licences l
   JOIN epos_devices d ON d.id=l.device_id
   WHERE d.venue_id=$1 AND d.kind='till' AND d.enabled=true
     AND l.deregistered_at IS NULL AND l.expires_at>now() AND d.token_hash IS NOT NULL`,[venueId]);
  if(count.rows[0].n>=entitlement.rows[0].max_tills)throw Error("licence_limit_reached");
  const token=randomBytes(32).toString("base64url");
  const deviceId=existing.rowCount?existing.rows[0].id:randomUUID();
  if(existing.rowCount){
   await client.query("UPDATE epos_devices SET token_hash=$1,token_issued_at=now(),enabled=true,kind='till' WHERE id=$2",[hash(token),deviceId]);
  }else{
   await client.query(`INSERT INTO epos_devices(id,venue_id,code,display_name,kind,enabled,token_hash,token_issued_at)
   VALUES($1,$2,$3,$3,'till',true,$4,now())`,[deviceId,venueId,input.deviceId,hash(token)]);
  }
  const expires=new Date(Math.min(Date.now()+35*86400000,new Date(entitlement.rows[0].paid_through).getTime()));
  await client.query(`INSERT INTO epos_device_licences(device_id,expires_at,deregistered_at)
   VALUES($1,$2,NULL) ON CONFLICT(device_id) DO UPDATE SET expires_at=EXCLUDED.expires_at,deregistered_at=NULL`,[deviceId,expires]);
  await client.query("COMMIT");
  return {siteId:"VL",deviceId:input.deviceId,deviceType:"till",expiresAt:expires.toISOString(),token};
 }catch(e){await client.query("ROLLBACK");throw e}finally{client.release()}
}
async function status(pool,token){
 if(typeof token!=="string"||! /^[A-Za-z0-9_-]{43}$/.test(token))return null;
 const r=await pool.query(`SELECT d.code,d.kind,l.expires_at,s.paid_through,
   (d.enabled AND l.deregistered_at IS NULL AND l.expires_at>now() AND s.paid_through>now()) AS valid
   FROM epos_devices d JOIN epos_device_licences l ON l.device_id=d.id
   JOIN epos_site_licences s ON s.venue_id=d.venue_id
   WHERE d.token_hash=$1`,[hash(token)]);
 if(!r.rowCount)return null;
 return {deviceId:r.rows[0].code,deviceType:r.rows[0].kind,expiresAt:r.rows[0].expires_at,valid:r.rows[0].valid};
}
async function deregister(pool,{siteId,deviceId}){
 validate({siteId,deviceId,deviceType:"till"});
 const client=await pool.connect();
 try{
  await client.query("BEGIN");
  const r=await client.query(`SELECT d.id FROM epos_devices d JOIN epos_venues v ON v.id=d.venue_id
   WHERE v.code=$1 AND d.code=$2 FOR UPDATE`,[siteId,deviceId]);
  if(r.rowCount!==1)throw Error("device_not_found");
  await client.query("UPDATE epos_devices SET token_hash=NULL,enabled=false WHERE id=$1",[r.rows[0].id]);
  await client.query("UPDATE epos_device_licences SET deregistered_at=now() WHERE device_id=$1",[r.rows[0].id]);
  await client.query("COMMIT");
  return {deviceId,deregistered:true};
 }catch(e){await client.query("ROLLBACK");throw e}finally{client.release()}
}
module.exports={register,status,deregister,validate};
