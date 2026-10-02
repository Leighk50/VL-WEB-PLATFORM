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
      menu.sections[0].items[0].price = `£999-${id}`;
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
      assert.equal(after.menus.find(item => item.id === id).sections[0].items[0].price, `£999-${id}`);
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
    for (const menu of content.menus) menu.sections[0].items[0].price = `£saved-${menu.id}`;
    fs.writeFileSync(path.join(app,"data/live-content-backup.json"),JSON.stringify(content));
    for (const entry of ["seed-sunday-menu.js","seed-dessert-menu.js","server.js"]) {
      const dir = path.join(root,entry);
      const env = {...process.env,CONTENT_DATA_DIR:dir,PORT:"0"};
      const code = `require('./${entry}');setTimeout(()=>process.exit(0),100)`;
      const result = spawnSync(process.execPath,["-e",code],{cwd:app,env,encoding:"utf8",timeout:5000});
      assert.equal(result.status,0,result.stderr);
      const after = JSON.parse(fs.readFileSync(path.join(dir,"content.json"),"utf8"));
      for (const menu of content.menus) {
        assert.equal(after.menus.find(m=>m.id===menu.id).sections[0].items[0].price,`£saved-${menu.id}`,`${entry}: ${menu.id}`);
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
