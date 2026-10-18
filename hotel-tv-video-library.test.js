'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createLibrary}=require('./hotel-tv-video-library'),{createStorage}=require('./hotel-tv-storage');
test('existing uploads migrate newest-first; recent selection survives container replacement and manifest recovery',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'tv-library-')),durable=path.join(root,'mount','tv');
 try{
  const storage=createStorage({WEBSITE_SITE_NAME:'test',HOME:path.join(root,'old')},durable);fs.mkdirSync(path.join(durable,'tv-media'),{recursive:true});
  for(let i=1;i<=4;i++){const name=String(i).repeat(8)+'-1111-1111-1111-111111111111.mp4',file=path.join(durable,'tv-media',name);fs.writeFileSync(file,'video');fs.utimesSync(file,1000+i,1000+i);}
  const current={title:'Current welcome',url:'https://www.villagelimits.co.uk/tv/media/44444444-1111-1111-1111-111111111111.mp4'};
  const list=createLibrary(storage).read(current);assert.equal(list.length,3);assert.equal(list[0].title,'Current welcome');assert.match(list[2].path,/22222222/);
  const next=createLibrary(createStorage({WEBSITE_SITE_NAME:'test',HOME:path.join(root,'new')},durable));assert.deepEqual(next.read(),list);
  fs.unlinkSync(path.join(durable,'tv-video-library.json'));assert.deepEqual(next.read(),list);
  assert.equal(fs.readdirSync(path.join(durable,'tv-media')).length,4,'library retention must not delete a video still in use');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
