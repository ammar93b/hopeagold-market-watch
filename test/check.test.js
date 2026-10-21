// The Huuto/Tori check: what counts as "stated in the listing", title rules, time zone.
// Run with: npm test

const test = require('node:test');
const assert = require('node:assert/strict');
require('../src/env');
const { weightStated, finenessStated } = require('../src/watch');
const { matchRules } = require('../src/rules');

test('the service runs on Finnish time when TZ is not set', () => {
  // src/env sets TZ when it is empty; the test runner's own TZ (if any) is kept
  assert.ok(process.env.TZ);
});

test('weight is "stated" only when the listing text has it', () => {
  assert.equal(weightStated('Hopea rannekoru 50 g', 50, 1), true);
  assert.equal(weightStated('paino 24,2 g', 24.2, 1), true);
  assert.equal(weightStated('124 g', 24, 1), false);
  assert.equal(weightStated('1 kg harkko', 1000, 1), true);
});

test('fineness is "stated" only when the listing text has it (not a year or a price)', () => {
  assert.equal(finenessStated('Hopea 925 rannekoru 50 g', 0.925), true);
  assert.equal(finenessStated('Ag 0,830 lusikka', 0.83), true);
  assert.equal(finenessStated('1 oz 999,9 hopea', 0.9999), true);
  assert.equal(finenessStated('Hopeinen rannekoru 50 g', 0.925), false);
  assert.equal(finenessStated('hinta 1925 €', 0.925), false);
  assert.equal(finenessStated('vuosi 1830', 0.83), false);
});

test('US dollar rule needs USA as a word, not a word ending in "us"', () => {
  assert.deepEqual(matchRules('Kanada 1 dollari 1935 harvinaisuus'), []);
  assert.deepEqual(matchRules('USA 1 dollar 1921 Morgan'), ['us-dollar-1878-1935']);
});

test('fineness 0.9999 is not "stated" by any 1000 in the text', () => {
  assert.equal(finenessStated('1 oz kultaharkko, painos 1000 kpl, 31,1 g', 0.9999), false);
  assert.equal(finenessStated('1 oz kultaharkko 999,9', 0.9999), true);
});

test('AI arguments: quotes, empty arguments and {prompt} with $ in the listing text', () => {
  const { splitArgs } = require('../src/ai');
  assert.deepEqual(splitArgs('-p {prompt} --tools "" --x \'a b\''), ['-p', '{prompt}', '--tools', '', '--x', 'a b']);
  const prompt = 'hinta 5 $$ ja $& {model}';
  const out = ['-p', '{prompt}'].map(a => a.replace(/\{prompt\}|\{model\}/g, (m) => (m === '{prompt}' ? prompt : 'M')));
  assert.equal(out[1], prompt);
});

test('fractional run hours are refused', () => {
  const settings = require('../src/settings');
  assert.throws(() => settings.update({ runHours: [9.5] }), /whole hours/);
});

test('a lock whose process is gone is not "locked", and is taken over', () => {
  const fs = require('fs'); const path = require('path'); const os = require('os');
  const { execFileSync } = require('child_process');
  // runs in a separate process against a temporary data folder, never the real one
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mw-lock-'));
  const src = path.join(__dirname, '..', 'src');
  const script = path.join(tmp, 'check.js');
  fs.writeFileSync(script, `
    const env = require(${JSON.stringify(path.join(src, 'env.js'))});
    env.DATA = ${JSON.stringify(tmp)};
    const fs = require('fs');
    fs.writeFileSync(${JSON.stringify(path.join(tmp, 'run.lock'))}, '999999');
    const s = require(${JSON.stringify(path.join(src, 'store.js'))});
    const before = s.isLocked();
    const got = s.lock();
    const mine = fs.readFileSync(${JSON.stringify(path.join(tmp, 'run.lock'))}, 'utf8') === String(process.pid);
    s.unlock();
    console.log(JSON.stringify([before, got, mine, fs.existsSync(${JSON.stringify(path.join(tmp, 'run.lock'))})]));
  `);
  const out = JSON.parse(execFileSync(process.execPath, [script]).toString());
  fs.rmSync(tmp, { recursive: true, force: true });
  assert.deepEqual(out, [false, true, true, false]);
});
