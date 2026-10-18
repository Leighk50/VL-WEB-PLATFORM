"use strict";
const {randomUUID}=require("node:crypto");
// Transactional service primitives. These are not public HTTP routes.
// Authentication/authorisation must be added before exposing mutations.
async function openTable(pool,{tableId,venueId=null}){
 if(!Number.isInteger(tableId)||tableId<1||tableId>11)throw Error("Invalid table");
 const client=await pool.connect();
 try{
  await client.query("BEGIN");
  const venue=await client.query("SELECT id FROM epos_venues WHERE code='VL'");
  if(venue.rowCount!==1)throw Error("Venue not registered");
  const id=venueId||venue.rows[0].id;
  if(id!==venue.rows[0].id)throw Error("Venue mismatch");
  const locked=await client.query("SELECT id FROM epos_tables WHERE id=$1 FOR UPDATE",[tableId]);
  if(locked.rowCount!==1)throw Error("Table not found");
  const existing=await client.query("SELECT id,version FROM epos_sessions WHERE table_id=$1 AND status='open' FOR UPDATE",[tableId]);
  let sessionId;
  if(existing.rowCount){sessionId=existing.rows[0].id}
  else{
   sessionId=randomUUID();
   await client.query("INSERT INTO epos_sessions(id,table_id,status,venue_id) VALUES($1,$2,'open',$3)",[sessionId,tableId,id]);
  }
  await client.query("INSERT INTO epos_tabs(id,session_id,label) VALUES($1,$2,'Tab 1') ON CONFLICT(session_id,label) DO NOTHING",[randomUUID(),sessionId]);
  await client.query("COMMIT");
  return {sessionId,tableId};
 }catch(e){await client.query("ROLLBACK");throw e}finally{client.release()}
}
async function addOrder(pool,{sessionId,tabId,deviceId,requestId,lines}){
 if(![sessionId,tabId,deviceId,requestId].every(x=>typeof x==="string"&&/^[0-9a-f-]{36}$/i.test(x)))throw Error("Invalid identifiers");
 if(!Array.isArray(lines)||lines.length<1||lines.length>50)throw Error("Invalid order lines");
 for(const l of lines)if(typeof l.productId!=="string"||!l.productId||typeof l.name!=="string"||!l.name||!Number.isInteger(l.quantity)||l.quantity<1||!Number.isInteger(l.unitPricePence)||l.unitPricePence<0)throw Error("Invalid line");
 const client=await pool.connect();
 try{
  await client.query("BEGIN");
  const session=await client.query("SELECT id,status,venue_id,table_id FROM epos_sessions WHERE id=$1 FOR UPDATE",[sessionId]);
  if(session.rowCount!==1||session.rows[0].status!=="open")throw Error("Session not open");
  const tab=await client.query("SELECT id FROM epos_tabs WHERE id=$1 AND session_id=$2 AND status='open'",[tabId,sessionId]);
  if(tab.rowCount!==1)throw Error("Valid open tab required");
  const device=await client.query("SELECT code FROM epos_devices WHERE id=$1 AND venue_id=$2 AND enabled=true",[deviceId,session.rows[0].venue_id]);
  if(device.rowCount!==1)throw Error("Device not authorised for venue");
  const previous=await client.query("SELECT response FROM epos_idempotency WHERE device_id=$1 AND request_id=$2",[device.rows[0].code,requestId]);
  if(previous.rowCount){await client.query("COMMIT");return previous.rows[0].response}
  const orderId=randomUUID();
  await client.query("INSERT INTO epos_orders(id,session_id,tab_id,origin_table_id,status) VALUES($1,$2,$3,$4,'new')",[orderId,sessionId,tabId,session.rows[0].table_id]);
  for(const line of lines){
   await client.query("INSERT INTO epos_order_lines(id,order_id,product_id,product_name,quantity,unit_price_pence,modifiers,instructions) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",[randomUUID(),orderId,line.productId,line.name,line.quantity,line.unitPricePence,JSON.stringify(line.modifiers||[]),line.instructions||""]);
  }
  const result={orderId,sessionId,tabId,accepted:true};
  await client.query("INSERT INTO epos_idempotency(device_id,request_id,response,venue_id) VALUES($1,$2,$3,$4)",[device.rows[0].code,requestId,JSON.stringify(result),session.rows[0].venue_id]);
  await client.query("UPDATE epos_sessions SET version=version+1 WHERE id=$1",[sessionId]);
  await client.query("COMMIT");return result;
 }catch(e){await client.query("ROLLBACK");throw e}finally{client.release()}
}
module.exports={openTable,addOrder};
