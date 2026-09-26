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
