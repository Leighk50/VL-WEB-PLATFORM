"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {spawnSync} = require("node:child_process");

test("startup preserves edited menus when seed markers are missing", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vl-menu-persistence-"));
  try {
    const content = JSON.parse(fs.readFileSync(path.join(__dirname, "data/default-content.json"), "utf8"));
    for (const id of ["main", "sunday", "desserts"]) {
      const menu = content.menus.find(item => item.id === id);
      assert.ok(menu, `${id} menu exists in defaults`);
      menu.sections.at(-1).items[0].price = `£999-${id}`;
    }
    fs.writeFileSync(path.join(dir, "content.json"), JSON.stringify(content));
    const env = {...process.env, CONTENT_DATA_DIR: dir, PORT: "0"};
    for (const script of ["seed-sunday-menu.js", "seed-dessert-menu.js"]) {
      const result = spawnSync(process.execPath, [script], {cwd:__dirname, env, encoding:"utf8"});
      assert.equal(result.status, 0, result.stderr);
    }
    const started = spawnSync(process.execPath, ["-e", "require('./server');setTimeout(()=>process.exit(0),350)"],
      {cwd:__dirname, env, encoding:"utf8", timeout:5000});
    assert.equal(started.status, 0, started.stderr);
    const after = JSON.parse(fs.readFileSync(path.join(dir, "content.json"), "utf8"));
    for (const id of ["main", "sunday", "desserts"]) {
      assert.equal(after.menus.find(item => item.id === id).sections.at(-1).items[0].price, `£999-${id}`);
      assert.equal(after.menus.filter(item => item.id === id).length, 1);
    }
  } finally {
    fs.rmSync(dir, {recursive:true, force:true});
  }
});

test("first startup replaces only bundled placeholder menus", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vl-menu-fresh-"));
  try {
    const env = {...process.env, CONTENT_DATA_DIR: dir, PORT: "0"};
    for (const script of ["seed-sunday-menu.js", "seed-dessert-menu.js"]) {
      const result = spawnSync(process.execPath, [script], {cwd:__dirname, env, encoding:"utf8"});
      assert.equal(result.status, 0, result.stderr);
    }
    const started = spawnSync(process.execPath, ["-e", "require('./server');setTimeout(()=>process.exit(0),350)"],
      {cwd:__dirname, env, encoding:"utf8", timeout:5000});
    assert.equal(started.status, 0, started.stderr);
    const after = JSON.parse(fs.readFileSync(path.join(dir, "content.json"), "utf8"));
    for (const [id, file] of [["main", "main-menu.json"], ["sunday", "sunday-menu.json"], ["desserts", "dessert-menu.json"]]) {
      const expected = JSON.parse(fs.readFileSync(path.join(__dirname, file), "utf8"));
      if (id === "sunday") expected.sections[0] = after.menus.find(menu => menu.id === "main").sections[0];
      assert.deepEqual(after.menus.find(menu => menu.id === id), expected);
    }
  } finally {
    fs.rmSync(dir, {recursive:true, force:true});
  }
});

test("restoring a deployment backup preserves every edited menu without seed markers", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vl-backup-restore-"));
  try {
    const app = path.join(root, "app");
    fs.mkdirSync(path.join(app, "data"), {recursive:true});
    for (const name of fs.readdirSync(__dirname)) {
      if (/\.(js|json)$/.test(name)) fs.copyFileSync(path.join(__dirname,name),path.join(app,name));
    }
    fs.copyFileSync(path.join(__dirname,"data/default-content.json"),path.join(app,"data/default-content.json"));
    const content = JSON.parse(fs.readFileSync(path.join(__dirname,"data/default-content.json"),"utf8"));
    for (const menu of content.menus) menu.sections.at(-1).items[0].price = `£saved-${menu.id}`;
    fs.writeFileSync(path.join(app,"data/live-content-backup.json"),JSON.stringify(content));
    for (const entry of ["seed-sunday-menu.js","seed-dessert-menu.js","server.js"]) {
      const dir = path.join(root,entry);
      const env = {...process.env,CONTENT_DATA_DIR:dir,PORT:"0"};
      const code = `require('./${entry}');setTimeout(()=>process.exit(0),100)`;
      const result = spawnSync(process.execPath,["-e",code],{cwd:app,env,encoding:"utf8",timeout:5000});
      assert.equal(result.status,0,result.stderr);
      const after = JSON.parse(fs.readFileSync(path.join(dir,"content.json"),"utf8"));
      for (const menu of content.menus) {
        assert.equal(after.menus.find(m=>m.id===menu.id).sections.at(-1).items[0].price,`£saved-${menu.id}`,`${entry}: ${menu.id}`);
      }
    }
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});

test("Camembert correction restores the reported old price once and preserves subsequent edits", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),"vl-camembert-"));
  try {
    const content = JSON.parse(fs.readFileSync(path.join(__dirname,"data/default-content.json"),"utf8"));
    const main = JSON.parse(fs.readFileSync(path.join(__dirname,"main-menu.json"),"utf8"));
    const dish = main.sections.flatMap(s=>s.items).find(i=>i.id==="main-camembert");
    dish.price="£8.50";
    content.menus[content.menus.findIndex(m=>m.id==="main")]=main;
    const file=path.join(dir,"content.json");
    const start=()=>{
      const result=spawnSync(process.execPath,["-e","require('./server');setTimeout(()=>process.exit(0),100)"],
        {cwd:__dirname,env:{...process.env,CONTENT_DATA_DIR:dir,PORT:"0"},encoding:"utf8",timeout:5000});
      assert.equal(result.status,0,result.stderr);
      return JSON.parse(fs.readFileSync(file,"utf8"));
    };
    const getDish=c=>c.menus.find(m=>m.id==="main").sections.flatMap(s=>s.items).find(i=>i.id==="main-camembert");
    fs.writeFileSync(file,JSON.stringify(content));
    let after=start();
    assert.equal(getDish(after).price,"£12.00");
    getDish(after).price="£8.50";
    fs.writeFileSync(file,JSON.stringify(after));
    assert.equal(getDish(start()).price,"£8.50");
    delete after.camembertPriceCorrection;
    getDish(after).price="£13.00";
    fs.writeFileSync(file,JSON.stringify(after));
    assert.equal(getDish(start()).price,"£13.00");
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});

test("Sunday starters follow main edits and reject an independent Sunday copy", () => {
  const sync = require("./shared-menu-starters");
  const main = JSON.parse(fs.readFileSync(path.join(__dirname,"main-menu.json"),"utf8"));
  const sunday = JSON.parse(fs.readFileSync(path.join(__dirname,"sunday-menu.json"),"utf8"));
  const otherCourses = structuredClone(sunday.sections.slice(1));
  const content = {menus:[main,sunday]};
  sync(content);
  assert.deepEqual(sunday.sections[0],main.sections[0]);
  assert.notEqual(sunday.sections[0],main.sections[0]);
  main.sections[0].items[0].price="£14.00";
  main.sections[0].items[0].allergens="Dairy";
  main.sections[0].items[0].visible=false;
  main.sections[0].items.push({id:"new-starter",name:"New starter",price:"£10.00"});
  sunday.sections[0].items[0].price="£1.00";
  sync(content);
  assert.deepEqual(sunday.sections[0],main.sections[0]);
  assert.deepEqual(sunday.sections.slice(1),otherCourses);
  assert.deepEqual(sync(structuredClone(content)),content);
  main.sections[0].items=[];
  sync(content);
  assert.deepEqual(sunday.sections[0].items,[]);
});

test("shared starters insert a missing section and remove it when main no longer has starters", () => {
  const sync = require("./shared-menu-starters");
  const content = {menus:[{id:"main",sections:[{name:"Starters",items:[]}]},{id:"sunday",sections:[{name:"Roasts",items:[]}]}]};
  sync(content);
  assert.equal(content.menus[1].sections[0].name,"Starters");
  content.menus[0].sections=[];
  sync(content);
  assert.deepEqual(content.menus[1].sections,[{name:"Roasts",items:[]}]);
});

test("Sunday print adds only selected visible main courses without changing saved menus", () => {
  const {sundayPrintMenu, printMenuPage} = require("./menu-print-page");
  const main = {id:"main",sections:[{name:"Starters",items:[{id:"starter",name:"Starter",includeOnSunday:true}]},{name:"Mains",items:[
    {id:"chosen",name:"Selected dish",price:"£24",description:"Fresh description",allergens:"Dairy",includeOnSunday:true},
    {id:"off",name:"Unchecked dish"}, {id:"hidden",name:"Hidden dish",includeOnSunday:true,visible:false}
  ]}]};
  const sunday = {id:"sunday",name:"Sunday",sections:[{name:"Sunday Roasts",items:[{id:"roast",name:"Roast"}]},{name:"Mains",items:[{id:"own",name:"Sunday dish"}]}]};
  const before = JSON.stringify([main,sunday]);
  const result = sundayPrintMenu(sunday,[main,sunday]);
  assert.deepEqual(result.sections[1].items.map(item=>item.id),["own","chosen"]);
  const html = printMenuPage(sunday,[],new Date(),[main,sunday]);
  for (const text of ["Selected dish","£24","Fresh description","Dairy","Roast","Sunday dish"]) assert.ok(html.includes(text));
  for (const text of ["Unchecked dish","Hidden dish","<h3>Starter</h3>"]) assert.ok(!html.includes(text));
  assert.equal(JSON.stringify([main,sunday]),before);
  main.sections[1].items[0].includeOnSunday = false;
  assert.equal(sundayPrintMenu(sunday,[main,sunday]),sunday);
  assert.equal(sundayPrintMenu(main,[main,sunday]),main);
});
