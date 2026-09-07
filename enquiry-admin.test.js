"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

// Lightweight storage-shape checks for the protected enquiry log.
test("enquiry log file can store dealt-with state", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vl-enquiries-"));
  const file = path.join(dir, "enquiries.json");
  const record = [{id:"1", receivedAt:new Date().toISOString(), type:"Contact", name:"Test Guest", email:"guest@example.com", phone:"01234567890", details:{message:"Hello"}, dealtWith:false, dealtWithAt:null}];
  fs.writeFileSync(file, JSON.stringify(record, null, 2));
  const loaded = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(loaded[0].dealtWith, false);
  loaded[0].dealtWith = true;
  loaded[0].dealtWithAt = new Date().toISOString();
  fs.writeFileSync(file, JSON.stringify(loaded, null, 2));
  const updated = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(updated[0].dealtWith, true);
  assert.ok(updated[0].dealtWithAt);
});
