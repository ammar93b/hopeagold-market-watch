// Loads .env (KEY=value lines) into process.env without overriding real env vars.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function loadEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) {
      let v = m[2];
      // Remove one pair of quotes only when they wrap the whole value (AI_ARGS can end in "")
      if (v.length >= 2 && (v[0] === '"' || v[0] === "'") && v[v.length - 1] === v[0] && !v.slice(1, -1).includes(v[0])) v = v.slice(1, -1);
      process.env[m[1]] = v;
    }
  }
}

loadEnv();

// Run hours and dates are Finnish time, whatever the machine's own clock is set to
// (a Raspberry Pi is often on UTC). TZ in the environment or .env still wins.
if (!process.env.TZ) process.env.TZ = 'Europe/Helsinki';

module.exports = {
  ROOT,
  DATA: path.join(ROOT, 'data'),
  NTFY_TOPIC: process.env.NTFY_TOPIC || '',
  // The AI command-line program and how to call it (README → "AI tool"). Set in .env.
  AI: {
    command: process.env.AI_COMMAND || '',
    args: process.env.AI_ARGS ?? '{prompt}',          // empty: the prompt goes to the program's input
    model: process.env.AI_MODEL || '',
    output: process.env.AI_OUTPUT || 'text',          // 'text' or 'json:<field>'
    errorField: process.env.AI_ERROR_FIELD || '',     // a JSON field that is true/set on errors
    stripEnv: (process.env.AI_STRIP_ENV || '').split(',').map(s => s.trim()).filter(Boolean),
  },
};
