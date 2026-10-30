"use strict";
const source=require("./catalogue-data.json");
function normalized(){
 const products=[...source.wet,...source.food];
 const seen=new Set();
 return products.map(p=>{
  if(typeof p.id!=="string"||!p.id||seen.has(p.id))throw Error("duplicate_or_missing_source_id");
  seen.add(p.id);
  const measures=p.measures||{};
  const prices=Object.values(measures);
  if(prices.some(v=>!Number.isSafeInteger(v)||v<0)||(!prices.length&&p.available===true))throw Error("invalid_legacy_price:"+p.id);
  return {sourceId:p.id,name:p.name,category:p.category,pricePence:measures.Standard??prices[0]??0,measures,printerRole:p.route==="kitchen"?"kitchen":p.route==="bar"?"bar":"receipt",active:p.available===true};
 });
}
async function preview(pool){
 const rows=normalized();
 const ids=rows.map(p=>p.sourceId);
 const existing=await pool.query(`SELECT legacy_source_id FROM epos_catalogue_products
 WHERE venue_id=(SELECT id FROM epos_venues WHERE code='VL') AND legacy_source_id=ANY($1::text[])`,[ids]);
 return {sourceCount:rows.length,alreadyImported:existing.rowCount,toImport:rows.length-existing.rowCount};
}
async function importMissing(pool){
 const products=normalized();
 const client=await pool.connect();
 try{
  await client.query("BEGIN");
  const venue=await client.query("SELECT id FROM epos_venues WHERE code='VL'");
  if(venue.rowCount!==1)throw Error("venue_missing");
  let imported=0,skipped=0;
  for(const p of products){
   const r=await client.query(`INSERT INTO epos_catalogue_products
    (venue_id,legacy_source_id,name,category,price_pence,measures,printer_role,active)
    VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8)
    ON CONFLICT (venue_id,legacy_source_id) WHERE legacy_source_id IS NOT NULL DO NOTHING
    RETURNING id`,
    [venue.rows[0].id,p.sourceId,p.name,p.category,p.pricePence,JSON.stringify(p.measures),p.printerRole,p.active]);
   if(r.rowCount)imported++;else skipped++;
  }
  await client.query("COMMIT");
  return {sourceCount:products.length,imported,skipped,existingProductsPreserved:true,tillCatalogueUnchanged:true};
 }catch(e){await client.query("ROLLBACK");throw e}finally{client.release()}
}
module.exports={normalized,preview,importMissing};
