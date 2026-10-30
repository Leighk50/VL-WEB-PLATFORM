"use strict";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const name=(s,max)=>typeof s==="string"&&s.trim().length>0&&s.trim().length<=max?s.trim():null;
async function list(pool){
 const products=await pool.query(`SELECT p.id,p.name,p.category,p.price_pence AS "pricePence",p.printer_role AS "printerRole",p.active,p.plu,p.source_group AS "sourceGroup",p.description,p.allergens,p.source_menu AS "sourceMenu",p.review_note AS "reviewNote",p.measures,p.price_levels_pence AS "priceLevelsPence",p.display_settings AS "displaySettings",p.legacy_source_id AS "legacySourceId",
 COALESCE(jsonb_agg(l.group_id) FILTER(WHERE l.group_id IS NOT NULL),'[]'::jsonb) AS "groupIds"
 FROM epos_catalogue_products p LEFT JOIN epos_product_option_groups l ON l.product_id=p.id
 WHERE p.venue_id=(SELECT id FROM epos_venues WHERE code='VL') GROUP BY p.id ORDER BY p.category,p.name`);
 const groups=await pool.query(`SELECT g.id,g.name,g.selection_mode AS "selectionMode",g.required,g.active,
 COALESCE(jsonb_agg(jsonb_build_object('id',c.id,'label',c.label,'priceDeltaPence',c.price_delta_pence,'sortOrder',c.sort_order)
 ORDER BY c.sort_order,c.label) FILTER(WHERE c.id IS NOT NULL),'[]'::jsonb) AS choices
 FROM epos_option_groups g LEFT JOIN epos_option_choices c ON c.group_id=g.id
 WHERE g.venue_id=(SELECT id FROM epos_venues WHERE code='VL') GROUP BY g.id ORDER BY g.name`);
 return {products:products.rows,groups:groups.rows};
}
async function saveProduct(pool,input){
 if(input.id!==undefined&&!UUID.test(input.id))throw Error("invalid_product_id");
 const title=name(input.name,120),category=name(input.category,60);
 if(!title||!category||!Number.isSafeInteger(input.pricePence)||input.pricePence<0||input.pricePence>10000000||!["kitchen","bar","receipt"].includes(input.printerRole)||typeof input.active!=="boolean")throw Error("invalid_product");
 if(!Array.isArray(input.groupIds)||input.groupIds.length>20||input.groupIds.some(x=>!UUID.test(x))||new Set(input.groupIds).size!==input.groupIds.length)throw Error("invalid_groups");
 const extra=input.details||{};
 if(typeof extra!=="object"||Array.isArray(extra)||extra===null)throw Error("invalid_details");
 const optionalText=(value,max)=>value==null?"":typeof value==="string"&&value.length<=max?value:(()=>{throw Error("invalid_text_field")})();
 const plu=optionalText(extra.plu,50),sourceGroup=optionalText(extra.sourceGroup,100),description=optionalText(extra.description,2000),allergens=optionalText(extra.allergens,1000),sourceMenu=optionalText(extra.sourceMenu,60),reviewNote=optionalText(extra.reviewNote,1000);
 const measures=extra.measures??{Standard:input.pricePence};
 if(!measures||typeof measures!=="object"||Array.isArray(measures)||Object.keys(measures).length>20||Object.entries(measures).some(([k,v])=>!k||k.length>50||!Number.isSafeInteger(v)||v<0||v>10000000))throw Error("invalid_measures");
 const levels=extra.priceLevelsPence??[];
 if(!Array.isArray(levels)||levels.length>10||levels.some(v=>!Number.isSafeInteger(v)||v<0||v>10000000))throw Error("invalid_price_levels");
 const display=extra.displaySettings??{buttonColour:"default",sortOrder:0,epos:true,mainMenu:false,sundayMenu:false,website:false};
 if(!display||!["default","blue","yellow","green"].includes(display.buttonColour)||!Number.isInteger(display.sortOrder)||display.sortOrder<0||display.sortOrder>99999||["epos","mainMenu","sundayMenu","website"].some(k=>typeof display[k]!=="boolean"))throw Error("invalid_display_settings");
 const client=await pool.connect();
 try{
  await client.query("BEGIN");
  const r=await client.query(input.id?
  `UPDATE epos_catalogue_products SET name=$2,category=$3,price_pence=$4,printer_role=$5,active=$6,updated_at=now()
 WHERE id=$1 AND venue_id=(SELECT id FROM epos_venues WHERE code='VL') RETURNING id`:
  `INSERT INTO epos_catalogue_products(venue_id,name,category,price_pence,printer_role,active)
 SELECT id,$2,$3,$4,$5,$6 FROM epos_venues WHERE code='VL' RETURNING id`,
  [input.id||null,title,category,input.pricePence,input.printerRole,input.active]);
  if(r.rowCount!==1)throw Error("product_not_found");
  const id=r.rows[0].id;
  await client.query(`UPDATE epos_catalogue_products SET plu=$2,source_group=$3,description=$4,allergens=$5,source_menu=$6,review_note=$7,measures=$8::jsonb,price_levels_pence=$9::jsonb,display_settings=$10::jsonb WHERE id=$1`,
  [id,plu,sourceGroup,description,allergens,sourceMenu||null,reviewNote,JSON.stringify(measures),JSON.stringify(levels),JSON.stringify(display)]);
  await client.query("DELETE FROM epos_product_option_groups WHERE product_id=$1",[id]);
  for(const groupId of input.groupIds){
   const added=await client.query(`INSERT INTO epos_product_option_groups(product_id,group_id)
 SELECT $1,g.id FROM epos_option_groups g JOIN epos_catalogue_products p ON p.id=$1
 WHERE g.id=$2 AND g.venue_id=p.venue_id RETURNING group_id`,[id,groupId]);
   if(added.rowCount!==1)throw Error("invalid_group_assignment");
  }
  await client.query("COMMIT");return {id};
 }catch(e){await client.query("ROLLBACK");throw e}finally{client.release()}
}
async function saveGroup(pool,input){
 if(input.id!==undefined&&!UUID.test(input.id))throw Error("invalid_group_id");
 const title=name(input.name,100);
 if(!title||!["single","multiple"].includes(input.selectionMode)||typeof input.required!=="boolean"||typeof input.active!=="boolean"||!Array.isArray(input.choices)||input.choices.length>40)throw Error("invalid_option_group");
 const choices=input.choices.map((c,i)=>{
  const label=name(c.label,100);
  if(!label||!Number.isSafeInteger(c.priceDeltaPence)||c.priceDeltaPence<0||c.priceDeltaPence>1000000)throw Error("invalid_choice");
  return {label,price:c.priceDeltaPence,order:i};
 });
 if(input.required&&!choices.length)throw Error("required_group_needs_choices");
 const client=await pool.connect();
 try{
  await client.query("BEGIN");
  const r=await client.query(input.id?
  `UPDATE epos_option_groups SET name=$2,selection_mode=$3,required=$4,active=$5
 WHERE id=$1 AND venue_id=(SELECT id FROM epos_venues WHERE code='VL') RETURNING id`:
  `INSERT INTO epos_option_groups(venue_id,name,selection_mode,required,active)
 SELECT id,$2,$3,$4,$5 FROM epos_venues WHERE code='VL' RETURNING id`,
  [input.id||null,title,input.selectionMode,input.required,input.active]);
  if(r.rowCount!==1)throw Error("group_not_found");
  const id=r.rows[0].id;
  await client.query("DELETE FROM epos_option_choices WHERE group_id=$1",[id]);
  for(const c of choices)await client.query("INSERT INTO epos_option_choices(group_id,label,price_delta_pence,sort_order) VALUES($1,$2,$3,$4)",[id,c.label,c.price,c.order]);
  await client.query("COMMIT");return {id};
 }catch(e){await client.query("ROLLBACK");throw e}finally{client.release()}
}
module.exports={list,saveProduct,saveGroup};
