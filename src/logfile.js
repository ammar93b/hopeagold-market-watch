// Keeps data/logs/service.log small: the service manager appends to it forever.
// Over 2 MB, only the last 500 kB are kept.

const fs = require('fs');
const path = require('path');
const { DATA } = require('./env');

const LOG = path.join(DATA, 'logs', 'service.log');
const MAX = 2e6;
const KEEP = 500e3;

function trimLog() {
  try { if (fs.statSync(LOG).size > MAX) fs.writeFileSync(LOG, fs.readFileSync(LOG, 'utf8').slice(-KEEP)); } catch {}
}

module.exports = { trimLog, LOG };
