'use strict';
const fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto');
const {execFileSync}=require('child_process');
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
function londonDate(now=new Date()){
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now).map(x=>[x.type,x.value]));
  return {date:`${p.year}-${p.month}-${p.day}`,hour:Number(p.hour)};
}
function inventory(root,prefix=''){
  const files=[];
  for(const name of fs.readdirSync(path.join(root,prefix)).sort()){
    if(name.endsWith('.tmp')||name.endsWith('.lock'))continue;
    const rel=path.join(prefix,name),full=path.join(root,rel),stat=fs.lstatSync(full);
    if(stat.isSymbolicLink())throw new Error('Backup refuses symbolic links');
    if(stat.isDirectory())files.push(...inventory(root,rel));
    else if(stat.isFile())files.push({path:rel,size:stat.size,mtime:stat.mtimeMs,hash:digest(fs.readFileSync(full))});
  }
  return files;
}
function verifyDirectory(root){
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
  if(manifest.version!==1||!Array.isArray(manifest.files))throw new Error('Invalid backup manifest');
  for(const f of manifest.files){
    const full=path.resolve(root,f.path);
    if(!full.startsWith(path.resolve(root)+path.sep))throw new Error('Unsafe backup path');
    if(digest(fs.readFileSync(full))!==f.hash)throw new Error('Backup checksum mismatch');
  }
  return manifest;
}
function verifyArchive(file){
  // Use only archives produced by this application; no restoration to the live site.
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vl-restore-check-'));
  try{execFileSync('tar',['-xzf',file,'-C',dir],{timeout:120000});return verifyDirectory(dir);}
  finally{fs.rmSync(dir,{recursive:true,force:true});}
}
function createArchive({dataDir,siteDir=__dirname,output}){
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'vl-backup-'));fs.chmodSync(tmp,0o700);
  try{
    const before=inventory(dataDir);
    if(!before.some(f=>f.path==='content.json'))throw new Error('Website content is missing; refusing incomplete backup');
    fs.mkdirSync(path.join(tmp,'data'));
    for(const f of before){const dest=path.join(tmp,'data',f.path);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(dataDir,f.path),dest);}
    if(JSON.stringify(before)!==JSON.stringify(inventory(dataDir)))throw new Error('Website data changed during backup; retry required');
    // Application source and public assets; credentials and dependencies are excluded.
    fs.mkdirSync(path.join(tmp,'site'));
    for(const name of fs.readdirSync(siteDir)){
      if(/\.(js|json)$/.test(name)&&!name.endsWith('.test.js')&&fs.lstatSync(path.join(siteDir,name)).isFile())fs.copyFileSync(path.join(siteDir,name),path.join(tmp,'site',name));
    }
    for(const name of ['public','data'])if(fs.existsSync(path.join(siteDir,name)))fs.cpSync(path.join(siteDir,name),path.join(tmp,'site',name),{recursive:true,dereference:false});
    const files=inventory(tmp).map(f=>({path:f.path,hash:f.hash,size:f.size}));
    fs.writeFileSync(path.join(tmp,'manifest.json'),JSON.stringify({version:1,createdAt:new Date().toISOString(),build:process.env.GITHUB_SHA||null,files},null,2));
    verifyDirectory(tmp);
    execFileSync('tar',['-czf',output,'-C',tmp,'manifest.json','data','site'],{timeout:120000});fs.chmodSync(output,0o600);
    verifyArchive(output);return {sha256:digest(fs.readFileSync(output)),files:files.length};
  }finally{fs.rmSync(tmp,{recursive:true,force:true});}
}
async function uploadArchive(file,containerUrl,blobName,fetcher=fetch){
  const container=new URL(containerUrl);
  if(container.protocol!=='https:'||!container.hostname.endsWith('.blob.core.windows.net')||container.search||!/^\/[a-z0-9-]+\/?$/.test(container.pathname))throw new Error('Use a private Azure container URL without a SAS token');
  if(!process.env.IDENTITY_ENDPOINT||!process.env.IDENTITY_HEADER)throw new Error('Enable the app system-assigned managed identity');
  const tokenUrl=new URL(process.env.IDENTITY_ENDPOINT);tokenUrl.searchParams.set('resource','https://storage.azure.com/');tokenUrl.searchParams.set('api-version','2019-08-01');
  const tokenResponse=await fetcher(tokenUrl,{headers:{'X-IDENTITY-HEADER':process.env.IDENTITY_HEADER},signal:AbortSignal.timeout(30000)});
  if(!tokenResponse.ok)throw new Error('Backup identity authentication failed');
  const token=(await tokenResponse.json()).access_token;if(!token)throw new Error('Backup identity token missing');
  const target=container.href.replace(/\/$/,'')+'/'+blobName.split('/').map(encodeURIComponent).join('/');
  const bytes=fs.readFileSync(file),headers={Authorization:'Bearer '+token,'x-ms-version':'2023-11-03','x-ms-date':new Date().toUTCString()};
  const put=await fetcher(target,{method:'PUT',headers:{...headers,'x-ms-blob-type':'BlockBlob','Content-Type':'application/gzip','If-None-Match':'*','x-ms-meta-sha256':digest(bytes)},body:bytes,signal:AbortSignal.timeout(300000)});
  if(!put.ok)throw new Error('Backup upload failed (HTTP '+put.status+')');
  const get=await fetcher(target,{headers:{...headers,'If-Match':put.headers.get('etag')},signal:AbortSignal.timeout(300000)});
  if(!get.ok||digest(Buffer.from(await get.arrayBuffer()))!==digest(bytes))throw new Error('Remote backup verification failed');
}
function startScheduler(){
  if(process.env.SITE_BACKUP_ENABLED!=='true')return;
  const dataDir=process.env.CONTENT_DATA_DIR||(process.env.HOME?path.join(process.env.HOME,'site','data'):path.join(__dirname,'data'));
  const control=path.join(path.dirname(dataDir),'backup-status');fs.mkdirSync(control,{recursive:true,mode:0o700});
  const marker=path.join(control,'last-success.json'),lock=path.join(control,'running.lock');let running=false;
  async function tick(){
    if(running)return;
    const day=londonDate();if(day.hour<3)return;
    let last;try{last=JSON.parse(fs.readFileSync(marker,'utf8'));}catch{}
    if(last?.date===day.date)return;
    running=true;let fd,archive;
    try{
      try{fd=fs.openSync(lock,'wx',0o600);}catch(e){if(e.code==='EEXIST'){if(Date.now()-fs.statSync(lock).mtimeMs>3600000)fs.unlinkSync(lock);return;}throw e;}
      fs.closeSync(fd);
      const prefix=process.env.SITE_BACKUP_PREFIX;
      if(!/^[a-z0-9-]+$/.test(prefix||''))throw new Error('Set a distinct SITE_BACKUP_PREFIX for this app');
      archive=path.join(control,crypto.randomUUID()+'.tar.gz');
      const info=createArchive({dataDir,output:archive});
      const blob=`${prefix}/${day.date}-${crypto.randomUUID()}.tar.gz`;
      await uploadArchive(archive,process.env.SITE_BACKUP_CONTAINER_URL,blob);
      const temp=marker+'.tmp';fs.writeFileSync(temp,JSON.stringify({date:day.date,completedAt:new Date().toISOString(),blob,...info}),{mode:0o600});fs.renameSync(temp,marker);
      console.log('Site backup verified:',blob);
    }catch(e){console.error('Site backup FAILED:',e.message);}
    finally{if(archive)fs.rmSync(archive,{force:true});if(fd!==undefined)fs.rmSync(lock,{force:true});running=false;}
  }
  const timer=setInterval(tick,15*60000);timer.unref();tick();
}
module.exports={londonDate,inventory,createArchive,verifyArchive,uploadArchive,startScheduler};
if(require.main===module){
  try{if(process.argv[2]!=='verify'||!process.argv[3])throw new Error('Usage: node site-backup.js verify trusted-backup.tar.gz');const m=verifyArchive(path.resolve(process.argv[3]));console.log('Restore check passed:',m.files.length,'files');}
  catch(e){console.error(e.message);process.exitCode=1;}
}
