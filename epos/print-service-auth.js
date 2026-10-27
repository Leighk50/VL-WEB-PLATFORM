"use strict";
const {randomBytes,createHash,timingSafeEqual}=require("node:crypto");
const digest=s=>createHash("sha256").update(s).digest("hex");
async function issue(pool){
 const token=randomBytes(32).toString("base64url");
 const r=await pool.query(`UPDATE epos_site_local_services c SET print_service_token_hash=$1,print_service_token_issued_at=now()
 FROM epos_devices d JOIN epos_device_licences l ON l.device_id=d.id
 JOIN epos_site_licences s ON s.venue_id=d.venue_id
 WHERE c.master_device_id=d.id AND c.venue_id=d.venue_id AND d.code='TILL-03'
 AND d.enabled=true AND l.deregistered_at IS NULL AND l.expires_at>now() AND s.paid_through>now()
 RETURNING d.code`,[digest(token)]);
 if(r.rowCount!==1)throw Error("master_not_licensed");
 return {token,deviceId:r.rows[0].code};
}
async function authenticate(pool,req){
 const header=req.headers.authorization||"";
 if(!/^Bearer [A-Za-z0-9_-]{43}$/.test(header))return null;
 const r=await pool.query(`SELECT d.id,d.venue_id,d.code,d.kind FROM epos_site_local_services c
 JOIN epos_devices d ON d.id=c.master_device_id
 JOIN epos_device_licences l ON l.device_id=d.id
 JOIN epos_site_licences s ON s.venue_id=d.venue_id
 WHERE c.print_service_token_hash=$1 AND d.enabled=true AND l.deregistered_at IS NULL
 AND l.expires_at>now() AND s.paid_through>now()`,[digest(header.slice(7))]);
 return r.rows[0]||null;
}
module.exports={issue,authenticate};
