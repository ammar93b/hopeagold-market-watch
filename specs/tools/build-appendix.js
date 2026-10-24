#!/usr/bin/env node
// Builds specs/appendix/*.md from the source: the exact AI prompts, the config
// and coin data, and the reference code for every rule enforced in code.
//   node specs/tools/build-appendix.js      (run from the project folder)
// If a function or block has moved or been renamed, this stops with an error
// naming it: update the list below, then run it again.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'specs', 'appendix');
const TODAY = new Date().toISOString().slice(0, 10);

const lines = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n');
const whole = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8').trimEnd();

// A top-level `function name` / `async function name`, up to its closing `}` line
function fn(file, name) {
  const l = lines(file);
  const i = l.findIndex(x => new RegExp(`^(async )?function ${name}\\(`).test(x));
  if (i < 0) throw new Error(`${file}: function ${name} not found`);
  const j = l.findIndex((x, k) => k > i && x === '}');
  if (j < 0) throw new Error(`${file}: end of function ${name} not found`);
  return l.slice(i, j + 1).join('\n');
}

// From the first line matching `start` to the first line (same or later) matching `end`
function region(file, start, end) {
  const l = lines(file);
  const i = l.findIndex(x => start.test(x));
  if (i < 0) throw new Error(`${file}: start ${start} not found`);
  const j = l.findIndex((x, k) => k >= i && end.test(x));
  if (j < 0) throw new Error(`${file}: end ${end} not found`);
  return l.slice(i, j + 1).join('\n');
}

const block = (title, code, lang = 'js') => `### ${title}\n\n\`\`\`${lang}\n${code}\n\`\`\`\n`;

function write(file, title, intro, parts) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, file), `# ${title}\n\n${intro}\n\n${parts.join('\n')}`);
  console.log('wrote', `specs/appendix/${file}`, `(${parts.length} parts)`);
}

const NOTE = `Generated from the source on ${TODAY} by \`node specs/tools/build-appendix.js\`. Do not edit by hand: change the source, then run the tool again. Each heading names the file and the function or block it came from.`;

write('A-ai-prompts.md', 'Appendix A: AI prompts and the AI program call',
  `${NOTE}\n\nExact prompt text, as JavaScript template code. Rebuild these word for word. \`\${...}\` marks a value filled in at run time; the expression shows where it comes from. Spec: 05-gold-silver-detection.md.`, [
    block('src/ai.js · splitArgs, childEnv and runAi (the AI program call)', `${fn('src/ai.js', 'splitArgs')}\n\n${fn('src/ai.js', 'childEnv')}\n\n${fn('src/ai.js', 'runAi')}`),
    block('src/ai.js · extractJson and askJson', `${fn('src/ai.js', 'extractJson')}\n\n${fn('src/ai.js', 'askJson')}`),
    block('rules/title-rules.js · BASE_METAL (shared by both prompts)', region('rules/title-rules.js', /^const BASE_METAL/, /^const BASE_METAL/)),
    block('src/ai.js · SCREEN_PROMPT', region('src/ai.js', /^const SCREEN_PROMPT/, /^Answer with ONLY this JSON: \{"keys"/)),
    block('src/ai.js · screen (how titles are sent)', fn('src/ai.js', 'screen')),
    block('src/ai.js · SPEC_LINES and IDENTIFY_PROMPT', region('src/ai.js', /^const SPEC_LINES/, /^Answer with ONLY this JSON: \{"items"/)),
    block('src/ai.js · describeSale and identify (how listings are sent)', `${fn('src/ai.js', 'describeSale')}\n\n${fn('src/ai.js', 'identify')}`),
  ]);

write('B-config-and-data.md', 'Appendix B: Config, coin data and title rules',
  `${NOTE}\n\nThe settings defaults, the verified coin table, the title rules and the project files, word for word. Specs: 01, 06, 05, 09.`, [
    block('config.js', whole('config.js')),
    block('my-links.js', whole('my-links.js')),
    block('rules/coin-specs.js', whole('rules/coin-specs.js')),
    block('rules/title-rules.js', whole('rules/title-rules.js')),
    block('rules/deal-rules.js', whole('rules/deal-rules.js')),
    block('src/rules.js', whole('src/rules.js')),
    block('.env.example', whole('.env.example'), 'sh'),
    block('package.json', whole('package.json'), 'json'),
  ]);

write('C-reference-algorithms.md', 'Appendix C: Reference code',
  `${NOTE}\n\nThe code behind every rule the specs say is enforced in code: sources and parsing, one check, valuation, alerts, settings, decisions, storage, the scheduler, the HTTP routes, the LaunchAgent and the report files.`, [
    block('src/sources.js · shared helpers (request, text, entities)', `${region('src/sources.js', /^const UA = /, /^const text = /)}\n\n${fn('src/sources.js', 'get')}`),
    block('src/sources.js · getSpot', fn('src/sources.js', 'getSpot')),
    block('src/sources.js · fetchHuuto', fn('src/sources.js', 'fetchHuuto')),
    block('src/sources.js · stripHtml, huutoDetails, huutoSeller', `${region('src/sources.js', /^const stripHtml = /, /\.trim\(\);$/)}\n\n${fn('src/sources.js', 'huutoDetails')}\n\n${fn('src/sources.js', 'huutoSeller')}`),
    block('src/sources.js · Tori parsing (toriAgeMinutes, CARD_RE, parseToriPage)', `${fn('src/sources.js', 'toriAgeMinutes')}\n\n${region('src/sources.js', /^const CARD_RE = /, /^const CARD_RE = /)}\n\n${fn('src/sources.js', 'parseToriPage')}`),
    block('src/sources.js · fetchTori, toriItem, parseToriItem, toriOffer', ['fetchTori', 'toriItem', 'parseToriItem', 'toriOffer'].map(n => fn('src/sources.js', n)).join('\n\n')),
    block('src/watch.js · schedule helpers', `${fn('src/watch.js', 'nextRunAfter')}\n\n${region('src/watch.js', /^const inRunWindow = /, /^const dayKey = /)}\n\n${fn('src/watch.js', 'dueSlot')}`),
    block('src/watch.js · weightStated, finenessStated, sellerIsBusiness, addDetails, refresh', ['weightStated', 'finenessStated', 'sellerIsBusiness', 'addDetails', 'refresh'].map(n => fn('src/watch.js', n)).join('\n\n')),
    block('src/watch.js · runOnce (time limit, saving) and checkWork (one check)', `${fn('src/watch.js', 'runOnce')}\n\n${fn('src/watch.js', 'checkWork')}`),
    block('src/value.js', whole('src/value.js')),
    block('src/alerts.js (exact alert texts)', whole('src/alerts.js')),
    block('src/notify.js', whole('src/notify.js')),
    block('src/settings.js', whole('src/settings.js')),
    block('src/decisions.js', whole('src/decisions.js')),
    block('src/store.js', whole('src/store.js')),
    block('src/env.js', whole('src/env.js')),
    block('server.js · runs and scheduler (startRun, slotStart, tick)', ['startRun', 'slotStart', 'tick'].map(n => fn('server.js', n)).join('\n\n')),
    block('server.js · state, sameOrigin, routes and the request handler', `${fn('server.js', 'state')}\n\n${fn('server.js', 'sameOrigin')}\n\n${region('server.js', /^const routes = \{/, /^\};$/)}\n\n${region('server.js', /^const server = http\.createServer/, /^\}\);$/)}`),
    block('scripts/service.js · plist, install, remove, restart, status', ['plist', 'unit', 'macRemove', 'macInstall', 'macRestart', 'macStatus', 'linuxRemove', 'linuxInstall', 'linuxRestart', 'linuxStatus'].map(n => fn('scripts/service.js', n)).join('\n\n')),
    block('src/report.js (report.html and latest.txt)', whole('src/report.js')),
  ]);
