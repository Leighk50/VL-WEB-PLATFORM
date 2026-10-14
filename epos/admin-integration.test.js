"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("admin editor exposes independent EPOS and website flags", () => {
  const source = fs.readFileSync(path.join(__dirname, "../public/assets/js/admin-dashboard.js"), "utf8");
  assert.match(source, /data-dish="showOnEpos"/);
  assert.match(source, /data-dish="showOnWebsite"/);
  assert.match(source, /data-dish="servingSizesText"/);
  assert.match(source, /data-dish="tastingNotes"/);
});
test("drinks and wine draft creation does not publish automatically", () => {
  const source = fs.readFileSync(path.join(__dirname, "../public/assets/js/admin-dashboard.js"), "utf8");
  assert.match(source, /id, name, description:"", visible:false/);
  assert.match(source, /ensureSpecialMenu\("drinks"/);
  assert.match(source, /ensureSpecialMenu\("wine"/);
});
