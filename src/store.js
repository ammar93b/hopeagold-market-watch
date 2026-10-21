// JSON files in data/: seen.json, findings.json, runs.json, spot.json,
// sellers.json, state.json

const fs = require('fs');
const path = require('path');
const { DATA } = require('./env');

const file = (name) => path.join(DATA, `${name}.json`);

function load(name, fallback) {
  try { return JSON.parse(fs.readFileSync(file(name), 'utf8')); } catch { return fallback; }
}

function save(name, data) {
  fs.mkdirSync(DATA, { recursive: true });
  const target = file(name);
  // Write then rename, so a run killed mid-write never leaves half a file
  fs.writeFileSync(`${target}.tmp`, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(`${target}.tmp`, target);
}

function writeText(name, text) {
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(path.join(DATA, name), text, 'utf8');
}

// One run at a time, across the service and run.js. The lock holds the process id.
// It is stale when that process is gone, or after 2 hours (a check stops after 90 min).
// Created atomically ('wx'); a stale lock is moved aside before taking over, so two
// processes can't both take it; only the owner removes it.
const LOCK = path.join(DATA, 'run.lock');
const STALE_MS = 2 * 3600e3;
function readLock() { try { return fs.readFileSync(LOCK, 'utf8').trim(); } catch { return null; } }
function pidAlive(pid) {
  const n = Number(pid);
  if (!Number.isInteger(n) || n <= 0) return false;
  try { process.kill(n, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}
function isLocked() {
  let age;
  try { age = Date.now() - fs.statSync(LOCK).mtimeMs; } catch { return false; }
  return age < STALE_MS && pidAlive(readLock());
}
function lock() {
  fs.mkdirSync(DATA, { recursive: true });
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      fs.writeFileSync(LOCK, String(process.pid), { flag: 'wx' });
      return true;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      if (isLocked()) return false;
      const stalePid = readLock();
      const aside = `${LOCK}.stale-${process.pid}`;
      try {
        fs.renameSync(LOCK, aside); // only one process can move this file
        if (fs.readFileSync(aside, 'utf8').trim() !== stalePid) {
          // Another process took over in between: put its fresh lock back and stop
          try { fs.linkSync(aside, LOCK); } catch {}
          fs.unlinkSync(aside);
          return false;
        }
        fs.unlinkSync(aside);
      } catch {}
    }
  }
  return false;
}
function unlock() {
  try { if (readLock() === String(process.pid)) fs.unlinkSync(LOCK); } catch {}
}

module.exports = { load, save, writeText, lock, unlock, isLocked };
