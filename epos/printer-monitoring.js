"use strict";
const ROLES=new Set(["receipt","kitchen"]);
const STATES=new Set(["online","offline","unknown"]);
async function report(pool,master,{role,state}){
 if(!ROLES.has(role)||!STATES.has(state))throw Error("invalid_printer_state");
 const r=await pool.query(`INSERT INTO epos_printer_status(venue_id,printer_role,state,checked_at)
 VALUES($1,$2,$3,now()) ON CONFLICT(venue_id,printer_role)
 DO UPDATE SET state=EXCLUDED.state,checked_at=EXCLUDED.checked_at
 RETURNING printer_role AS role,state,checked_at AS "checkedAt"`,[master.venue_id,role,state]);
 return r.rows[0];
}
async function status(pool,device){
 const r=await pool.query(`SELECT printer_role AS role,state,checked_at AS "checkedAt"
 FROM epos_printer_status WHERE venue_id=$1 ORDER BY printer_role`,[device.venue_id]);
 return r.rows;
}
module.exports={report,status};
