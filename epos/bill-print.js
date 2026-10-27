"use strict";
const {randomUUID}=require("node:crypto");
const {getSession}=require("./shared-till");
function buildBill(snapshot,tableNumber,tabId){
 if(!snapshot.sessionId)throw Error("table_not_open");
 const tabs=tabId?snapshot.tabs.filter(t=>t.id===tabId):snapshot.tabs;
 if(!tabs.length)throw Error("tab_not_found");
 const lines=[];
 for(const tab of tabs){
  for(const item of tab.items||[]){
   const quantity=Number(item.quantity),unitPricePence=Number(item.pricePence);
   if(!Number.isSafeInteger(quantity)||quantity<=0||!Number.isSafeInteger(unitPricePence)||unitPricePence<0)throw Error("invalid_bill_line");
   if(item.modifiers&&Array.isArray(item.modifiers)&&item.modifiers.length)throw Error("bill_modifiers_require_review");
   lines.push({tab:tab.label,name:String(item.name).slice(0,100),quantity,unitPricePence,lineTotalPence:quantity*unitPricePence});
  }
 }
 if(!lines.length)throw Error("no_bill_items");
 const totalPence=lines.reduce((sum,x)=>sum+x.lineTotalPence,0);
 if(!Number.isSafeInteger(totalPence))throw Error("invalid_bill_total");
 return {type:"bill",siteId:"VL",tableNumber,tabLabel:tabId?tabs[0].label:"All tabs",lines,totalPence,paymentStatus:"UNPAID",vatStatement:"VAT breakdown not available",createdAt:new Date().toISOString()};
}
async function enqueueBill(pool,device,{tableNumber,tabId}){
 if(!Number.isInteger(tableNumber)||tableNumber<1||tableNumber>11)throw Error("invalid_table");
 if(tabId!==undefined&&(!/^[0-9a-f-]{36}$/i.test(tabId)))throw Error("invalid_tab");
 const snapshot=await getSession(pool,tableNumber);
 const payload=buildBill(snapshot,tableNumber,tabId);
 const id=randomUUID();
 const r=await pool.query(`INSERT INTO epos_print_jobs(id,venue_id,source_device_id,printer_role,job_type,payload)
 VALUES($1,$2,$3,'receipt','bill',$4::jsonb) RETURNING id,status`,
 [id,device.venue_id,device.id,JSON.stringify(payload)]);
 return r.rows[0];
}
module.exports={buildBill,enqueueBill};
