#!/usr/bin/env node
// HopeaGold Market Watch — one run.
//   node run.js               run now and push to the phone
//   node run.js --no-push     run now, report only (no phone messages)
//   node run.js --test-push   send one test notification and exit
//   node run.js --scheduled   only runs inside the run hours (the service schedules by itself)

const { runOnce, inRunWindow } = require('./src/watch');
const notify = require('./src/notify');

const args = process.argv.slice(2);

// Keep the service log small (it appends forever otherwise)
require('./src/logfile').trimLog();

async function main() {
  if (args.includes('--test-push')) {
    const r = await notify.push({ title: '🪙 Market Watch test', message: 'If you can read this, phone alerts work.', click: 'https://www.huuto.net' });
    console.log(r.skipped ? `Not sent: ${r.skipped}` : 'Test notification sent.');
    return 0;
  }
  const scheduled = args.includes('--scheduled');
  // Outside the run hours a scheduled run is skipped (no alerts in the night)
  if (scheduled && !inRunWindow()) {
    console.log(new Date().toLocaleString('fi-FI'), 'Outside run hours — skipped.');
    return 0;
  }
  const run = await runOnce({ push: !args.includes('--no-push'), reason: scheduled ? 'scheduled' : 'manual' });
  return run?.error ? 1 : 0;
}

main().then(code => process.exit(code)).catch(err => { console.error(err); process.exit(1); });
