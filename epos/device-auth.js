"use strict";
const {createHash,randomBytes}=require("node:crypto");
const digest=token=>createHash("sha256").update(token,"utf8").digest("hex");
function generateDeviceToken(){return randomBytes(32).toString("base64url")}
async function authenticateDevice(pool,req){
 const header=req.headers.authorization;
 if(typeof header!=="string"||!/^Bearer [A-Za-z0-9_-]{43}$/.test(header))return null;
 const hash=digest(header.slice(7));
 const result=await pool.query(
 "SELECT id,venue_id,code,kind FROM epos_devices WHERE token_hash=$1 AND enabled=true",
 [hash]
 );
 return result.rows[0]||null;
}
async function issueDeviceToken(pool,code){
 if(!/^TILL-[0-9]{2}$/.test(code))throw Error("Invalid till code");
 const token=generateDeviceToken();
 const result=await pool.query(
 "UPDATE epos_devices SET token_hash=$1,token_issued_at=now() WHERE code=$2 AND enabled=true AND venue_id=(SELECT id FROM epos_venues WHERE code='VL') RETURNING id,code",
 [digest(token),code]
 );
 if(result.rowCount!==1)throw Error("Device not found or disabled");
 return {code,token};
}
module.exports={digest,generateDeviceToken,authenticateDevice,issueDeviceToken};
