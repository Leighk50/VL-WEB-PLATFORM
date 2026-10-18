"use strict";
const {randomBytes,randomUUID,createHash}=require("node:crypto");
const hash=x=>createHash("sha256").update(x).digest("hex");
const pairingCode=()=>randomBytes(12).toString("base64url");
async function startPairing(pool,{deviceCode,kind,name}){
 if(!/^[A-Z][A-Z0-9-]{2,31}$/.test(deviceCode)||!["till","ipad","bar","kitchen"].includes(kind)||typeof name!=="string"||name.length<2||name.length>80)throw Error("Invalid device details");
 const client=await pool.connect();
 try{
  await client.query("BEGIN");
  const venue=await client.query("SELECT id FROM epos_venues WHERE code='VL'");
  if(venue.rowCount!==1)throw Error("Venue not found");
  const venueId=venue.rows[0].id;
  const dev=await client.query(`INSERT INTO epos_devices(id,venue_id,code,display_name,kind,enabled)
   VALUES($1,$2,$3,$4,$5,true)
   ON CONFLICT(venue_id,code) DO UPDATE SET display_name=EXCLUDED.display_name
   RETURNING id,kind,enabled`,[randomUUID(),venueId,deviceCode,name,kind]);
  if(!dev.rows[0].enabled||dev.rows[0].kind!==kind)throw Error("Device disabled or type mismatch");
  await client.query("UPDATE epos_device_pairings SET expires_at=now() WHERE device_id=$1 AND redeemed_at IS NULL AND expires_at>now()",[dev.rows[0].id]);
  const code=pairingCode();
  await client.query("INSERT INTO epos_device_pairings(id,venue_id,device_id,code_hash,expires_at) VALUES($1,$2,$3,$4,now()+interval '5 minutes')",[randomUUID(),venueId,dev.rows[0].id,hash(code)]);
  await client.query("COMMIT");
  return {code,deviceCode,expiresInSeconds:300};
 }catch(e){await client.query("ROLLBACK");throw e}finally{client.release()}
}
async function redeemPairing(pool,code){
 if(typeof code!=="string"||!/^[A-Za-z0-9_-]{16}$/.test(code))throw Error("Invalid pairing code");
 const client=await pool.connect();
 try{
  await client.query("BEGIN");
  const match=await client.query(`SELECT p.id,p.device_id,d.code FROM epos_device_pairings p
   JOIN epos_devices d ON d.id=p.device_id
   WHERE p.code_hash=$1 AND p.expires_at>now() AND p.redeemed_at IS NULL AND d.enabled=true FOR UPDATE OF p`,[hash(code)]);
  if(match.rowCount!==1)throw Error("Pairing expired or already used");
  const token=randomBytes(32).toString("base64url");
  await client.query("UPDATE epos_devices SET token_hash=$1,token_issued_at=now() WHERE id=$2",[hash(token),match.rows[0].device_id]);
  await client.query("UPDATE epos_device_pairings SET redeemed_at=now() WHERE id=$1",[match.rows[0].id]);
  await client.query("COMMIT");
  return {deviceCode:match.rows[0].code,token};
 }catch(e){await client.query("ROLLBACK");throw e}finally{client.release()}
}
module.exports={startPairing,redeemPairing,pairingCode};
