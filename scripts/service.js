// Installs / removes the background service that keeps Market Watch running
// (server.js: dashboard on localhost:3002, hourly checks).
//   node scripts/service.js install | remove | restart | status | print
//
//   macOS  → launchd agent (starts at login)
//   Linux  → systemd user service (Raspberry Pi OS): starts at boot once lingering is on,
//            see deploy/raspberry-pi.md
//   print  → shows the file that would be installed, changes nothing

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const LOG = path.join(ROOT, 'data', 'logs', 'service.log');
const PORT = Number(process.env.PORT) || 3002;
const IS_MAC = process.platform === 'darwin';
const IS_LINUX = process.platform === 'linux';

// ── Shared ──────────────────────────────────────────────────────────────────

const PATHS = [path.dirname(process.execPath), path.join(os.homedir(), '.local', 'bin'),
  '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(':');
const SERVER = path.join(ROOT, 'server.js');

// ── macOS: launchd ──────────────────────────────────────────────────────────

const LABEL = 'fi.hopeagold.marketwatch';
const PLIST = path.join(os.homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`);
const domain = IS_MAC ? `gui/${process.getuid()}` : '';
const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const launchctl = (...a) => execFileSync('launchctl', a, { stdio: 'pipe' }).toString();

function plist() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xml(process.execPath)}</string>
    <string>${xml(SERVER)}</string>
  </array>
  <key>WorkingDirectory</key><string>${xml(ROOT)}</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>${xml(PATHS)}</string>
    <key>HOME</key><string>${xml(os.homedir())}</string>
    <key>PORT</key><string>${PORT}</string>
  </dict>
  <key>StandardOutPath</key><string>${xml(LOG)}</string>
  <key>StandardErrorPath</key><string>${xml(LOG)}</string>
  <key>ProcessType</key><string>Background</string>
</dict>
</plist>
`;
}

function macRemove({ quiet = false } = {}) {
  try { launchctl('bootout', `${domain}/${LABEL}`); } catch {}
  if (fs.existsSync(PLIST)) fs.unlinkSync(PLIST);
  if (!quiet) console.log('Removed: the Market Watch service is stopped and will not start at login.');
}

function macInstall() {
  fs.mkdirSync(path.dirname(LOG), { recursive: true });
  fs.mkdirSync(path.dirname(PLIST), { recursive: true });
  macRemove({ quiet: true });
  fs.writeFileSync(PLIST, plist(), 'utf8');
  launchctl('bootstrap', domain, PLIST);
  console.log(`Installed ${PLIST}`);
  console.log(`Dashboard: http://localhost:${PORT}   Log: ${LOG}`);
}

function macRestart() {
  try { launchctl('kickstart', '-k', `${domain}/${LABEL}`); console.log('Restarted.'); }
  catch { console.log('Not installed. Run: npm run service:install'); }
}

function macStatus() {
  if (!fs.existsSync(PLIST)) return console.log('Not installed. Run: npm run service:install');
  try {
    const out = launchctl('print', `${domain}/${LABEL}`);
    const pick = (re) => (out.match(re) || [])[1];
    console.log(`Service: ${pick(/state = ([^\n]+)/) || '?'} · pid ${pick(/pid = (\d+)/) || '—'} · last exit code ${pick(/last exit code = ([^\n]+)/) || '—'}`);
    console.log(`Dashboard: http://localhost:${PORT}`);
  } catch {
    console.log('Plist exists but is not loaded. Run: npm run service:install');
  }
}

// ── Linux: systemd (user service) ───────────────────────────────────────────

const UNIT_NAME = 'hopeagold-marketwatch.service';
const UNIT = path.join(os.homedir(), '.config', 'systemd', 'user', UNIT_NAME);
const q = (s) => `"${String(s).replace(/(["\\])/g, '\\$1')}"`;
const systemctl = (...a) => execFileSync('systemctl', ['--user', ...a], { stdio: 'pipe' }).toString();

function unit() {
  return `[Unit]
Description=HopeaGold Market Watch (dashboard, hourly checks)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${q(ROOT)}
ExecStart=${q(process.execPath)} ${q(SERVER)}
Environment=${q(`PATH=${PATHS}`)}
Environment=${q(`HOME=${os.homedir()}`)}
Environment=${q(`PORT=${PORT}`)}
Restart=always
RestartSec=30
StandardOutput=append:${LOG}
StandardError=append:${LOG}

[Install]
WantedBy=default.target
`;
}

// Lingering keeps user services running at boot, without a login
function lingering() {
  try {
    const out = execFileSync('loginctl', ['show-user', os.userInfo().username, '-p', 'Linger'], { stdio: 'pipe' }).toString();
    return /Linger=yes/.test(out);
  } catch { return null; }
}

function linuxRemove({ quiet = false } = {}) {
  try { systemctl('disable', '--now', UNIT_NAME); } catch {}
  if (fs.existsSync(UNIT)) fs.unlinkSync(UNIT);
  try { systemctl('daemon-reload'); } catch {}
  if (!quiet) console.log('Removed: the Market Watch service is stopped and will not start at boot.');
}

function linuxInstall() {
  fs.mkdirSync(path.dirname(LOG), { recursive: true });
  fs.mkdirSync(path.dirname(UNIT), { recursive: true });
  linuxRemove({ quiet: true });
  fs.writeFileSync(UNIT, unit(), 'utf8');
  systemctl('daemon-reload');
  systemctl('enable', '--now', UNIT_NAME);
  console.log(`Installed ${UNIT}`);
  console.log(`Dashboard: http://localhost:${PORT} (on the Pi itself; see deploy/raspberry-pi.md for your Mac)   Log: ${LOG}`);
  if (lingering() === false) {
    console.log(`\nOne more step, so Market Watch also runs after a reboot without anyone logging in:\n  sudo loginctl enable-linger ${os.userInfo().username}`);
  }
}

function linuxRestart() {
  try { systemctl('restart', UNIT_NAME); console.log('Restarted.'); }
  catch { console.log('Not installed. Run: npm run service:install'); }
}

function linuxStatus() {
  if (!fs.existsSync(UNIT)) return console.log('Not installed. Run: npm run service:install');
  try {
    const active = systemctl('is-active', UNIT_NAME).trim();
    const pid = systemctl('show', UNIT_NAME, '-p', 'MainPID', '--value').trim();
    const exit = systemctl('show', UNIT_NAME, '-p', 'ExecMainStatus', '--value').trim();
    console.log(`Service: ${active} · pid ${pid && pid !== '0' ? pid : '—'} · last exit code ${exit || '—'}`);
    console.log(`Dashboard: http://localhost:${PORT}`);
    if (lingering() === false) console.log(`Not set to start at boot yet: sudo loginctl enable-linger ${os.userInfo().username}`);
  } catch {
    console.log('Unit exists but is not loaded. Run: npm run service:install');
  }
}

// ── Commands ────────────────────────────────────────────────────────────────

const cmd = process.argv[2];
const NONE = 'This system is not supported (macOS and Linux only).';
const impl = IS_MAC
  ? { install: macInstall, remove: macRemove, restart: macRestart, status: macStatus, print: () => console.log(`# ${PLIST}\n${plist()}`) }
  : IS_LINUX
    ? { install: linuxInstall, remove: linuxRemove, restart: linuxRestart, status: linuxStatus, print: () => console.log(`# ${UNIT}\n${unit()}`) }
    : null;

if (!['install', 'remove', 'restart', 'status', 'print'].includes(cmd)) {
  console.log('Usage: node scripts/service.js install | remove | restart | status | print');
  process.exit(1);
}
if (!impl) { console.log(NONE); process.exit(1); }
impl[cmd]();
