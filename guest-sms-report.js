'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Keep the private SMS report independent of website content, TV arrivals and codes.
function createStore(env = process.env, azureDir = '/home/site/vl-guest-sms') {
  const dir = env.WEBSITE_SITE_NAME ? azureDir : (env.CONTENT_DATA_DIR || (env.HOME ? path.join(env.HOME, 'site', 'data') : path.join(__dirname, 'data')));
  const file = path.join(dir, 'latest-reservation-upload.json');
  const fields = ['first','last','full','checkout','room','phone','phoneRaw','checkin','ref'];
  function clean(input) {
    if (!input || !Array.isArray(input.reservations) || !Array.isArray(input.cancelled) || !Array.isArray(input.headers) || input.reservations.length + input.cancelled.length > 1000 || !input.reservations.length && !input.cancelled.length) throw Error('Choose a reservation report containing booking rows.');
    if (input.headers.length > 200 || !input.headers.every(h => typeof h === 'string' && h.length <= 200)) throw Error('Invalid report columns.');
    const rows = list => list.map(row => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) throw Error('Invalid reservation row.');
      const result = {};
      for (const key of fields) {
        if (row[key] !== undefined && typeof row[key] !== 'string') throw Error('Invalid reservation field.');
        const value = row[key] || '';
        if (value.length > 500) throw Error('Reservation field is too long.');
        result[key] = value;
      }
      return result;
    });
    return {filename:path.basename(String(input.filename || 'Reservation report')).slice(0,200), headers:input.headers, reservations:rows(input.reservations), cancelled:rows(input.cancelled)};
  }
  function read() {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (e) { if (e.code === 'ENOENT') return null; throw Error('The saved reservation report could not be loaded. Please retry.'); }
  }
  function save(input) {
    const report = {...clean(input), uploadedAt:new Date().toISOString()};
    fs.mkdirSync(dir, {recursive:true, mode:0o700});
    const temp = file + '.' + crypto.randomUUID() + '.tmp';
    try {
      fs.writeFileSync(temp, JSON.stringify(report), {encoding:'utf8', mode:0o600});
      fs.renameSync(temp, file);
    } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
    return report;
  }
  return {read, save};
}
module.exports = {createStore};
