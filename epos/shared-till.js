"use strict";
const {randomUUID}=require("node:crypto");
const {openTable,addOrder}=require("./shared-orders");
async function getSession(pool,tableId){
 const result=await pool.query(`SELECT s.id AS "sessionId",s.version,t.id AS "tableId",
  COALESCE((SELECT jsonb_agg(jsonb_build_object('id',b.id,'label',b.label,'status',b.status,
   'items',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',l.id,'name',l.product_name,'pricePence',l.unit_price_pence,
    'quantity',l.quantity,'modifiers',l.modifiers,'instructions',l.instructions,'status',o.status)
    ORDER BY o.created_at,l.id)
    FROM epos_orders o JOIN epos_order_lines l ON l.order_id=o.id
    WHERE o.tab_id=b.id AND o.status<>'cancelled'),'[]'::jsonb))
   ORDER BY b.label) FROM epos_tabs b WHERE b.session_id=s.id),'[]'::jsonb) AS tabs
 FROM epos_tables t LEFT JOIN epos_sessions s ON s.table_id=t.id AND s.status='open'
 WHERE t.id=$1`,[tableId]);
 if(result.rowCount!==1)throw Error("Table not found");
 return result.rows[0];
}
async function addTab(pool,sessionId,label){
 if(!/^Tab [1-9][0-9]{0,2}$/.test(label))throw Error("Invalid tab label");
 const client=await pool.connect();
 try{
  await client.query("BEGIN");
  const session=await client.query("SELECT id FROM epos_sessions WHERE id=$1 AND status='open' FOR UPDATE",[sessionId]);
  if(session.rowCount!==1)throw Error("Session closed");
  const result=await client.query(`INSERT INTO epos_tabs(id,session_id,label)
   VALUES($1,$2,$3) ON CONFLICT(session_id,label) DO UPDATE SET label=EXCLUDED.label
   RETURNING id,label`,[randomUUID(),sessionId,label]);
  await client.query("COMMIT");return result.rows[0];
 }catch(e){await client.query("ROLLBACK");throw e}finally{client.release()}
}
function validatedLines(catalogue,requested){
 if(!Array.isArray(requested)||requested.length<1||requested.length>30)throw Error("Select 1 to 30 items");
 const products=[...catalogue.wet,...catalogue.food];
 return requested.map(line=>{
  const p=products.find(x=>x.id===line.productId&&x.available===true);
  if(!p)throw Error("Product unavailable");
  if(typeof line.measure!=="string"||!Object.hasOwn(p.measures||{},line.measure))throw Error("Invalid measure");
  const price=p.measures[line.measure];
  if(!Number.isSafeInteger(price)||price<=0)throw Error("Product price unavailable");
  if(!Number.isInteger(line.quantity)||line.quantity<1||line.quantity>20)throw Error("Invalid quantity");
  if(line.modifiers!==undefined&&(!Array.isArray(line.modifiers)||line.modifiers.length))throw Error("Modifiers not enabled in shared test yet");
  return {productId:p.id,name:p.name+" · "+line.measure,quantity:line.quantity,unitPricePence:price,modifiers:[],instructions:""};
 });
}
async function submitOrder(pool,catalogue,{tableId,tabId,requestId,lines},device){
 if(!Number.isInteger(tableId)||tableId<1||tableId>11)throw Error("Invalid table");
 const checked=validatedLines(catalogue,lines);
 const table=await getSession(pool,tableId);
 if(!table.sessionId)throw Error("Open the table first");
 if(!table.tabs.some(t=>t.id===tabId&&t.status==="open"))throw Error("Select an open bill tab");
 return addOrder(pool,{sessionId:table.sessionId,tabId,deviceId:device.id,requestId,lines:checked});
}
module.exports={getSession,addTab,validatedLines,submitOrder,openTable};
