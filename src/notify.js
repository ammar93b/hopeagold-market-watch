// Phone notifications through ntfy.sh. JSON must be POSTed to the root URL and
// priority must be a number (posting to /<topic> delivers raw JSON text).

const { NTFY_TOPIC } = require('./env');
const CFG = require('../config');

const PRIORITY = { min: 1, low: 2, default: 3, high: 4, urgent: 5 };

async function push({ title, message, priority = 'default', click, actions, tags }) {
  const topic = CFG.ntfyTopic || NTFY_TOPIC;
  if (!topic) return { skipped: 'no ntfy topic (dashboard Settings or NTFY_TOPIC in .env)' };
  const body = { topic, title, message, priority: PRIORITY[priority] ?? 3 };
  if (click) body.click = click;
  if (actions?.length) body.actions = actions.slice(0, 3);
  if (tags?.length) body.tags = tags;
  const res = await fetch('https://ntfy.sh/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`ntfy answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return { sent: true };
}

module.exports = { push };
