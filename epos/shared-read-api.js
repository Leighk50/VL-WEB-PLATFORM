"use strict";
const {timingSafeEqual}=require("node:crypto");
function authenticated(req,secret){
 if(!secret||secret.length<32)return false;
 const provided=req.headers["x-epos-staging-key"];
 if(typeof provided!=="string")return false;
 const a=Buffer.from(provided),b=Buffer.from(secret);
 return a.length===b.length&&timingSafeEqual(a,b);
}
async function getTableSnapshot(pool){
 const result=await pool.query(`
 SELECT t.id AS table_number,t.capacity,t.dog_friendly,
        s.id AS session_id,s.version,
        COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id',tab.id,'label',tab.label,'status',tab.status,
            'items',COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'id',li.id,'productName',li.product_name,'quantity',li.quantity,
                'unitPricePence',li.unit_price_pence,'modifiers',li.modifiers,'instructions',li.instructions,
                'orderStatus',ord.status
              ) ORDER BY ord.created_at,li.id)
              FROM epos_orders ord JOIN epos_order_lines li ON li.order_id=ord.id
              WHERE ord.tab_id=tab.id AND ord.status<>'cancelled'
            ),'[]'::jsonb)
          ) ORDER BY tab.label)
          FROM epos_tabs tab WHERE tab.session_id=s.id
        ),'[]'::jsonb) AS tabs
 FROM epos_tables t
 LEFT JOIN epos_sessions s ON s.table_id=t.id AND s.status='open'
 ORDER BY t.id`);
 return result.rows;
}
module.exports={authenticated,getTableSnapshot};
