'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
let cached;
function loadRelease(){
 if(cached)return cached;
 const version='1.2.12';
 // Storage parts preserve the exact signed widget; Samsung receives one WGT.
 const bytes=Buffer.concat([1,2,3,4].map(n=>fs.readFileSync(path.join(__dirname,'hotel-tv-install','VillageLimits-'+version+'.wgt.part'+n))));
 if(bytes.length!==35376452||crypto.createHash('sha256').update(bytes).digest('hex')!=='d8d42c8266e60097685c56ea58495a2244157decb5985b253d1596dfd792b166')throw Error('TV release integrity check failed');
 cached={version,bytes};return cached;
}
module.exports={loadRelease};
