'use strict';
const zlib=require('node:zlib');
// Read only allowlisted media from the already verified signed 1.2.11 archive.
function media(name){
 if(!['lindus-combined-test.mp4','lindus-welcome-music.wav'].includes(name))throw Error('Unknown pilot asset');
 const zip=require('./hotel-tv-release').loadRelease().bytes;
 let end=zip.length-22;while(end>=Math.max(0,zip.length-65557)&&zip.readUInt32LE(end)!==0x06054b50)end--;
 if(end<0)throw Error('Invalid signed archive');
 let cursor=zip.readUInt32LE(end+16);const count=zip.readUInt16LE(end+10);
 for(let i=0;i<count;i++){
  if(zip.readUInt32LE(cursor)!==0x02014b50)throw Error('Invalid archive directory');
  const method=zip.readUInt16LE(cursor+10),size=zip.readUInt32LE(cursor+20),length=zip.readUInt16LE(cursor+28),extra=zip.readUInt16LE(cursor+30),comment=zip.readUInt16LE(cursor+32),offset=zip.readUInt32LE(cursor+42);
  const found=zip.subarray(cursor+46,cursor+46+length).toString();cursor+=46+length+extra+comment;
  if(found!==name)continue;
  const start=offset+30+zip.readUInt16LE(offset+26)+zip.readUInt16LE(offset+28),bytes=zip.subarray(start,start+size);
  if(method===0)return bytes;if(method===8)return zlib.inflateRawSync(bytes);throw Error('Unsupported media encoding');
 }
 throw Error('Missing pilot media');
}
module.exports={media};
