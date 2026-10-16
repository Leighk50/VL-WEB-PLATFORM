'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function createStorage(env = process.env, azureDir = '/home/site/vl-guest-sms') {
  const legacyDir = env.CONTENT_DATA_DIR || (env.HOME ? path.join(env.HOME, 'site', 'data') : path.join(__dirname, 'data'));
  const dir = env.WEBSITE_SITE_NAME ? azureDir : legacyDir;
  const file = path.join(dir, 'key-safe-codes.json');
  const backup = path.join(dir + '-backups', 'key-safe-codes.json');
  const empty = () => ({'1':'','2':'','3':'','4':'','5':'','6':''});
  function normalize(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('Invalid key safe codes.');
    const codes = empty();
    for (let room = 1; room <= 6; room++) {
      const value = String(input[String(room)] ?? '').trim();
      if (value && !/^\d{1,12}$/.test(value)) throw Error(`Room ${room} code must contain digits only.`);
      codes[String(room)] = value;
    }
    return codes;
  }
  function readFile(name) { return normalize(JSON.parse(fs.readFileSync(name, 'utf8').replace(/^\uFEFF/, ''))); }
  function atomicWrite(name, codes) {
    fs.mkdirSync(path.dirname(name), {recursive:true, mode:0o700});
    const temp = name + '.' + crypto.randomUUID() + '.tmp';
    try {
      fs.writeFileSync(temp, JSON.stringify(codes, null, 2), {encoding:'utf8', mode:0o600});
      fs.renameSync(temp, name);
    } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
  }
  function read() {
    try {
      if (fs.existsSync(file)) return readFile(file);
      // Recovery takes precedence over potentially stale container-local data.
      const legacy = path.join(legacyDir, 'key-safe-codes.json');
      const source = fs.existsSync(backup) ? backup : (legacy !== file && fs.existsSync(legacy) ? legacy : null);
      if (!source) return empty();
      const codes = readFile(source);
      atomicWrite(file, codes);
      atomicWrite(backup, codes);
      return codes;
    } catch { throw Error('Saved key safe codes could not be loaded. Please retry; do not overwrite them.'); }
  }
  function write(input) {
    // Refuse to overwrite unreadable existing data with a blank form.
    read();
    const codes = normalize(input);
    atomicWrite(file, codes);
    atomicWrite(backup, codes);
    return codes;
  }
  return {read, write};
}
module.exports = {createStorage};
