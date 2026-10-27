"use strict";
async function getMaster(pool){
 const r=await pool.query(`SELECT d.code AS "masterDevice",c.receipt_printer_host::text AS "printerHost",c.receipt_printer_port AS "printerPort"
 FROM epos_site_local_services c JOIN epos_venues v ON v.id=c.venue_id
 LEFT JOIN epos_devices d ON d.id=c.master_device_id WHERE v.code='VL'`);
 return r.rows[0]||null;
}
async function setMaster(pool,deviceCode){
 if(!/^TILL-[0-9]{2}$/.test(deviceCode))throw Error("invalid_device");
 const client=await pool.connect();
 try{
  await client.query("BEGIN");
  const device=await client.query(`SELECT d.id FROM epos_devices d
   JOIN epos_venues v ON v.id=d.venue_id
   JOIN epos_device_licences l ON l.device_id=d.id
   JOIN epos_site_licences s ON s.venue_id=d.venue_id
   WHERE v.code='VL' AND d.code=$1 AND d.kind='till' AND d.enabled=true
   AND d.token_hash IS NOT NULL AND l.deregistered_at IS NULL
   AND l.expires_at>now() AND s.paid_through>now() FOR UPDATE OF d`,[deviceCode]);
  if(device.rowCount!==1)throw Error("till_not_licensed");
  const result=await client.query(`UPDATE epos_site_local_services
   SET master_device_id=$1,updated_at=now()
   WHERE venue_id=(SELECT id FROM epos_venues WHERE code='VL')
   RETURNING receipt_printer_host::text AS "printerHost",receipt_printer_port AS "printerPort"`,[device.rows[0].id]);
  if(result.rowCount!==1)throw Error("master_configuration_missing");
  await client.query("COMMIT");
  return {masterDevice:deviceCode,...result.rows[0]};
 }catch(e){await client.query("ROLLBACK");throw e}finally{client.release()}
}
module.exports={getMaster,setMaster};
