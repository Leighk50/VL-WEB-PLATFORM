'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
let cached;
function loadRelease(){
 if(cached)return cached;
 const version='1.2.16';
 // Storage parts preserve the exact signed widget; Samsung receives one WGT.
 const bytes=Buffer.concat([1,2,3,4,5,6,7,8].map(n=>fs.readFileSync(path.join(__dirname,'hotel-tv-install','VillageLimits-'+version+'.wgt.part'+n))));
 if(bytes.length!==4621808||crypto.createHash('sha256').update(bytes).digest('hex')!=='8fdf71c09f5c2c274aca1e42f46c3c7261b956d6f6720b41feae421a11dc23d0')throw Error('TV release integrity check failed');
 cached={version,bytes};return cached;
}
module.exports={loadRelease};
