'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const releases={
 '1.2.12':{parts:4,size:35376452,sha256:'d8d42c8266e60097685c56ea58495a2244157decb5985b253d1596dfd792b166'},
 '1.2.16':{parts:8,size:4621808,sha256:'8fdf71c09f5c2c274aca1e42f46c3c7261b956d6f6720b41feae421a11dc23d0'}
};
const cached=new Map();
function loadRelease(version='1.2.16'){
 if(cached.has(version))return cached.get(version);
 const release=releases[version];
 if(!release)throw Error('Unknown TV release');
 // Storage parts preserve the exact signed widget; Samsung receives one WGT.
 const bytes=Buffer.concat(Array.from({length:release.parts},(_,i)=>fs.readFileSync(path.join(__dirname,'hotel-tv-install','VillageLimits-'+version+'.wgt.part'+(i+1)))));
 if(bytes.length!==release.size||crypto.createHash('sha256').update(bytes).digest('hex')!==release.sha256)throw Error('TV release integrity check failed');
 const result={version,bytes};cached.set(version,result);return result;
}
module.exports={loadRelease};
