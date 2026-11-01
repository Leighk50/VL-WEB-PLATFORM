"use strict";
const uuid=/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;
async function load(pool){
 const [layouts,products]=await Promise.all([
 pool.query(`SELECT id,name,device_class AS "deviceClass",layout,updated_at AS "updatedAt" FROM epos_screen_layouts WHERE venue_id=(SELECT id FROM epos_venues WHERE code='VL') ORDER BY name`),
 pool.query(`SELECT id,legacy_source_id AS "legacySourceId",plu,name,category,price_pence AS "pricePence",measures,active FROM epos_catalogue_products WHERE venue_id=(SELECT id FROM epos_venues WHERE code='VL') ORDER BY category,name`)
 ]);
 return {layouts:layouts.rows,products:products.rows};
}
async function save(pool,input){
 const name=typeof input.name==="string"?input.name.trim():"";
 if(!name||name.length>80||!["desktop","tablet","phone"].includes(input.deviceClass))throw Error("invalid_layout");
 const layout=input.layout;
 if(!layout||layout.columns<2||layout.columns>10||!Number.isInteger(layout.columns)||!Array.isArray(layout.buttons)||layout.buttons.length>120)throw Error("invalid_layout_grid");
 const allowed=new Set(["blank","plu","menu","function","tender"]);
 for(const b of layout.buttons){
  if(!b||!allowed.has(b.type)||typeof b.label!=="string"||b.label.length>50||typeof b.color!=="string"||!/^#[0-9a-f]{6}$/i.test(b.color))throw Error("invalid_button");
  if(b.type==="plu"&&!uuid.test(b.productId||""))throw Error("product_required");
  if(b.type!=="plu"&&b.productId)throw Error("unexpected_product");
  if(b.type!=="plu"&&b.type!=="blank")throw Error("button_type_not_implemented_yet");
 }
 const ids=[...new Set(layout.buttons.filter(b=>b.type==="plu").map(b=>b.productId))];
 if(ids.length){
  const result=await pool.query(`SELECT id FROM epos_catalogue_products WHERE venue_id=(SELECT id FROM epos_venues WHERE code='VL') AND active=true AND id=ANY($1::uuid[])`,[ids]);
  if(result.rowCount!==ids.length)throw Error("inactive_or_unknown_product");
 }
 const result=await pool.query(`INSERT INTO epos_screen_layouts(venue_id,name,device_class,layout)
 SELECT id,$1,$2,$3::jsonb FROM epos_venues WHERE code='VL'
 ON CONFLICT(venue_id,name,device_class) DO UPDATE SET layout=EXCLUDED.layout,updated_at=now()
 RETURNING id,updated_at AS "updatedAt"`,[name,input.deviceClass,JSON.stringify(layout)]);
 return {saved:true,draftOnly:true,...result.rows[0]};
}
module.exports={load,save};
