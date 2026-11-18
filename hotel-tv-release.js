'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
let previous;
function loadPilotRelease(){
 if(previous)return previous;
 const version='1.2.12';
 // Storage parts preserve the exact signed widget; Samsung receives one WGT.
 const bytes=Buffer.concat([1,2,3,4].map(n=>fs.readFileSync(path.join(__dirname,'hotel-tv-install','VillageLimits-'+version+'.wgt.part'+n))));
 if(bytes.length!==35376452||crypto.createHash('sha256').update(bytes).digest('hex')!=='d8d42c8266e60097685c56ea58495a2244157decb5985b253d1596dfd792b166')throw Error('TV release integrity check failed');
 previous={version,bytes};return previous;
}

let current;
function loadRelease(){
 if(current)return current;
 const version='1.2.15';
 const bytes=Buffer.concat([1,2,3,4].map(n=>fs.readFileSync(path.join(__dirname,'hotel-tv-install','VillageLimits-'+version+'.wgt.part'+n))));
 if(bytes.length!==13382567||crypto.createHash('sha256').update(bytes).digest('hex')!=='25d757892496dc33f61647dfb68d27cf950c61c64ec96ed7042e0139098243bb')throw Error('TV release integrity check failed');
 current={version,bytes};return current;
}
module.exports={loadRelease,loadPilotRelease};
