"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const {spawn} = require("node:child_process");

const secret = "enquiry-integration-secret";
function token() {
  const value = `${Date.now()-3000}.test`;
  return `${value}.${crypto.createHmac("sha256",secret).update(value).digest("base64url")}`;
}
function adminToken() {
  const raw = `admin|${Date.now()+60000}`;
  return `${Buffer.from(raw).toString("base64url")}.${crypto.createHmac("sha256",secret).update(raw).digest("hex")}`;
}
async function start(t, dir, entry) {
  // Only the child process mocks Microsoft. No test emails leave this machine.
  const script = `
    const http=require('http');
    const listen=http.Server.prototype.listen;
    http.Server.prototype.listen=function(...args){this.once('listening',()=>console.log('TEST_PORT='+this.address().port));return listen.apply(this,args)};
    global.fetch=async(url,opts)=>{
      if(String(url).includes('login.microsoftonline.com'))return {ok:true,json:async()=>({access_token:'test'})};
      if(String(url).includes('/sendMail'))return {status:opts.body.includes('Fail Email')?500:202,text:async()=> 'Mock delivery failure'};
      return {ok:true,status:200,json:async()=>({}),text:async()=>''};
    };
    require('./${entry}');`;
  const child = spawn(process.execPath, ["-e",script], {
    cwd:__dirname,
    env:{...process.env,PORT:"0",CONTENT_DATA_DIR:dir,SESSION_SECRET:secret,ADMIN_USERNAME:"admin",MS_TENANT_ID:"test",MS_CLIENT_ID:"test",MS_CLIENT_SECRET:"test"},
    stdio:["ignore","pipe","pipe"]
  });
  t.after(()=>{if(child.exitCode===null)child.kill()});
  let output="";
  child.stderr.on("data",chunk=>{output+=chunk});
  const port = await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{child.kill();reject(new Error(`Startup timeout: ${output}`))},10000);
    child.once("exit",code=>{clearTimeout(timer);reject(new Error(`Server exited ${code}: ${output}`))});
    child.stdout.on("data",chunk=>{output+=chunk;const match=output.match(/TEST_PORT=(\d+)/);if(match){clearTimeout(timer);resolve(match[1])}});
  });
  return {url:`http://127.0.0.1:${port}`, stop:()=>new Promise(resolve=>{child.once('exit',resolve);child.kill()})};
}
const common={name:"Test Guest",email:"guest@example.com",phone:"01526 123456"};
async function submit(url, route, fields) {
  return fetch(`${url}/${route}/enquire`,{method:"POST",redirect:"manual",body:new URLSearchParams({...common,...fields,form_token:token()})});
}
async function list(url, authenticated=true) {
  return fetch(`${url}/api/admin/enquiries`,{headers:authenticated?{Authorization:`Bearer ${adminToken()}`}:{}});
}

test("General and Christmas enquiries persist without the optional startup wrapper and survive restart",async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"vl-enquiry-flow-"));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const direct=await start(t,dir,"server.js");
  assert.equal((await submit(direct.url,"contact",{enquiryType:"General enquiry",contactMethod:"Email",message:"Please contact me about dinner."})).status,303);
  assert.equal((await submit(direct.url,"christmas",{preferredDate:"2099-12-12",partySize:"8",message:"Office celebration"})).status,303);
  const stored=JSON.parse(fs.readFileSync(path.join(dir,"enquiries.json"),"utf8"));
  assert.deepEqual(stored.map(x=>x.type).sort(),["Christmas","Contact"]);
  assert.ok(stored.every(x=>x.deliveryStatus==="sent" && !x.dealtWith));
  assert.ok(stored.every(x=>!('form_token' in x.details)));
  await direct.stop();
  const full=await start(t,dir,"seo-consolidation-entry.js");
  assert.equal((await list(full.url,false)).status,401);
  const data=await (await list(full.url)).json();
  assert.equal(data.enquiries.length,2);
  const id=data.enquiries[0].id;
  const updated=await fetch(`${full.url}/api/admin/enquiries/${id}`,{method:"PUT",headers:{Authorization:`Bearer ${adminToken()}`,"Content-Type":"application/json"},body:JSON.stringify({dealtWith:true})});
  assert.equal(updated.status,200);
  assert.equal((await (await list(full.url)).json()).enquiries.find(x=>x.id===id).dealtWith,true);
  await full.stop();
});

test("email failures remain visible; invalid forms and storage failures cannot produce success",async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"vl-enquiry-failures-"));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const app=await start(t,dir,"seo-consolidation-entry.js");
  const fields={enquiryType:"General enquiry",contactMethod:"Email",message:"Please contact me about dinner."};
  assert.equal((await submit(app.url,"contact",{...fields,name:"Fail Email"})).status,502);
  let records=(await (await list(app.url)).json()).enquiries;
  assert.equal(records.length,1);
  assert.equal(records[0].deliveryStatus,"failed");
  assert.equal((await submit(app.url,"contact",{...fields,email:"invalid"})).status,400);
  assert.equal((await (await list(app.url)).json()).enquiries.length,1);
  fs.writeFileSync(path.join(dir,"enquiries.json"),"broken JSON");
  assert.equal((await submit(app.url,"contact",fields)).status,502);
  assert.equal(fs.readFileSync(path.join(dir,"enquiries.json"),"utf8"),"broken JSON");
  await app.stop();
});
