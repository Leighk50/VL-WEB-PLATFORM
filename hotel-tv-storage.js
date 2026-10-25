'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function createStorage(env=process.env,azureDir='/home/site/vl-tv-state'){
const contentDir=env.CONTENT_DATA_DIR||(env.HOME?path.join(env.HOME,'site','data'):path.join(__dirname,'data'));
// Azure's application HOME may be /root, which belongs to the disposable container.
// The App Service /home mount survives replacement of the running container.
const dir=env.WEBSITE_SITE_NAME?azureDir:contentDir;
const files=['hotel-tv.json','hotel-tv.json.previous','tv-devices.json','tv-arrivals.json','tv-local-explorer.json'];
function migrate(){
 if(dir===contentDir)return;
 fs.mkdirSync(dir,{recursive:true});
 for(const name of files){const from=path.join(contentDir,name),to=path.join(dir,name);if(!fs.existsSync(to)&&fs.existsSync(from))fs.copyFileSync(from,to,fs.constants.COPYFILE_EXCL);}
 const oldMedia=path.join(contentDir,'tv-media'),newMedia=path.join(dir,'tv-media');
 if(fs.existsSync(oldMedia)){fs.mkdirSync(newMedia,{recursive:true});for(const name of fs.readdirSync(oldMedia)){if(!/^[a-f0-9-]+\.mp4$/.test(name))continue;const to=path.join(newMedia,name);if(!fs.existsSync(to))fs.copyFileSync(path.join(oldMedia,name),to,fs.constants.COPYFILE_EXCL);}}
}
migrate();
const backupDir=path.join(path.dirname(dir),path.basename(dir)+'-backups');
for(const name of ['hotel-tv.json','tv-devices.json','tv-arrivals.json','tv-local-explorer.json']){const target=path.join(dir,name),backup=path.join(backupDir,name);if(!fs.existsSync(target)&&fs.existsSync(backup)){JSON.parse(fs.readFileSync(backup,'utf8'));fs.mkdirSync(dir,{recursive:true});fs.copyFileSync(backup,target,fs.constants.COPYFILE_EXCL);}}
for(const name of ['hotel-tv.json','tv-devices.json','tv-arrivals.json','tv-local-explorer.json']){const target=path.join(dir,name),backup=path.join(backupDir,name);if(fs.existsSync(target)&&!fs.existsSync(backup)){JSON.parse(fs.readFileSync(target,'utf8'));fs.mkdirSync(backupDir,{recursive:true});fs.copyFileSync(target,backup,fs.constants.COPYFILE_EXCL);}}
function write(name,value){
 fs.mkdirSync(dir,{recursive:true});const target=path.join(dir,name),temp=target+'.'+crypto.randomUUID()+'.tmp';
 try{fs.writeFileSync(temp,JSON.stringify(value,null,2),{mode:0o600});if(fs.existsSync(target))fs.copyFileSync(target,target+'.previous');fs.renameSync(temp,target);
 // Keep a second current copy outside the active state directory. No private data is bundled in deployments.
 fs.mkdirSync(backupDir,{recursive:true});const backup=path.join(backupDir,name);const next=backup+'.'+crypto.randomUUID()+'.tmp';fs.copyFileSync(target,next);fs.renameSync(next,backup);
 }finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
}
return {dir,contentDir,write};
}
module.exports={...createStorage(),createStorage};
