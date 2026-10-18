'use strict';
const fs=require('node:fs'),path=require('node:path');
function createLibrary(storage){
 const name='tv-video-library.json',file=path.join(storage.dir,name),media=path.join(storage.dir,'tv-media');
 const valid=/^[a-f0-9-]{36}\.mp4$/;
 function read(current){
  if(fs.existsSync(file))return JSON.parse(fs.readFileSync(file,'utf8'));
  const backup=path.join(storage.dir+'-backups',name);
  if(fs.existsSync(backup)){const saved=JSON.parse(fs.readFileSync(backup,'utf8'));storage.write(name,saved);return saved;}
  // Existing uploaded files become selectable on the first visit after upgrading.
  const items=fs.existsSync(media)?fs.readdirSync(media).filter(n=>valid.test(n)).map(n=>{
   const stat=fs.statSync(path.join(media,n)),url='/tv/media/'+n;
   let active=false;try{active=new URL(current?.url).pathname===url;}catch{}
   return {path:url,title:active?current.title:'Uploaded video '+new Date(stat.mtimeMs).toISOString().slice(0,10),uploadedAt:new Date(stat.mtimeMs).toISOString(),size:stat.size};
  }).sort((a,b)=>Date.parse(b.uploadedAt)-Date.parse(a.uploadedAt)).slice(0,3):[];
  storage.write(name,items);return items;
 }
 function add(video,current){
  const items=[video,...read(current).filter(v=>v.path!==video.path)].slice(0,3);
  storage.write(name,items);return items;
 }
 return {read,add};
}
module.exports={createLibrary};
