'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
let cached;
function loadRelease(){
 if(cached)return cached;
 const version='1.2.11';
 // Storage parts preserve the exact signed widget; Samsung receives one WGT.
 const bytes=Buffer.concat([1,2,3,4].map(n=>fs.readFileSync(path.join(__dirname,'hotel-tv-install','VillageLimits-'+version+'.wgt.part'+n))));
 if(bytes.length!==35375903||crypto.createHash('sha256').update(bytes).digest('hex')!=='a1289b8de33ad426982066b5c623a842a9d5af181a41bece36e6af877102c6a7')throw Error('TV release integrity check failed');
 cached={version,bytes};return cached;
}
module.exports={loadRelease};
