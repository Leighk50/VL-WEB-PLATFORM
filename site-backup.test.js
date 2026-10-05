'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),os=require('os');
const {londonDate,createArchive,verifyArchive,uploadArchive}=require('./site-backup');
test('3am UK scheduling follows winter and summer offsets',()=>{
  assert.equal(londonDate(new Date('2026-01-05T03:00:00Z')).hour,3);
  assert.equal(londonDate(new Date('2026-07-05T02:00:00Z')).hour,3);
  assert.equal(londonDate(new Date('2026-07-05T01:59:00Z')).hour,2);
});
test('archive restore preserves reservations, content, users, uploads and source, excludes environment secrets',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vl-backup-test-')),dataDir=path.join(dir,'data'),siteDir=path.join(dir,'site'),output=path.join(dir,'backup.tar.gz');
  try{
    fs.mkdirSync(path.join(dataDir,'uploads'),{recursive:true});fs.mkdirSync(siteDir);
    for(const f of ['content.json','reservations.json','admin-users.json'])fs.writeFileSync(path.join(dataDir,f),JSON.stringify({name:f}));
    fs.writeFileSync(path.join(dataDir,'uploads','photo.png'),'photo');fs.writeFileSync(path.join(siteDir,'server.js'),'source');fs.writeFileSync(path.join(siteDir,'.env'),'secret');
    const info=createArchive({dataDir,siteDir,output}),m=verifyArchive(output);
    assert.equal(info.files,5);assert.equal(m.files.some(f=>f.path==='data/reservations.json'),true);assert.equal(m.files.some(f=>f.path.includes('.env')),false);
    const oldEndpoint=process.env.IDENTITY_ENDPOINT,oldHeader=process.env.IDENTITY_HEADER;
    process.env.IDENTITY_ENDPOINT='http://localhost/identity';process.env.IDENTITY_HEADER='test';
    try{
      const bytes=fs.readFileSync(output);let calls=0;
      await uploadArchive(output,'https://testaccount.blob.core.windows.net/backups','staging/test.tar.gz',async(url,options)=>{
        calls++;if(calls===1)return new Response(JSON.stringify({access_token:'test'}));
        if(calls===2){assert.equal(options.headers['If-None-Match'],'*');return new Response('',{status:201,headers:{etag:'test'}});}
        return new Response(bytes);
      });assert.equal(calls,3);
      calls=0;await assert.rejects(uploadArchive(output,'https://testaccount.blob.core.windows.net/backups','staging/bad.tar.gz',async()=>{calls++;return calls===1?new Response(JSON.stringify({access_token:'test'})):calls===2?new Response('',{status:201,headers:{etag:'test'}}):new Response('corrupt');}),/verification failed/);
    }finally{if(oldEndpoint===undefined)delete process.env.IDENTITY_ENDPOINT;else process.env.IDENTITY_ENDPOINT=oldEndpoint;if(oldHeader===undefined)delete process.env.IDENTITY_HEADER;else process.env.IDENTITY_HEADER=oldHeader;}
    fs.unlinkSync(path.join(dataDir,'content.json'));assert.throws(()=>createArchive({dataDir,siteDir,output}),/content is missing/);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
