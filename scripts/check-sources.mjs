// Fetches every source URL in data/*.json and records a content fingerprint.
// Writes data/source-status.json and, when something changed or failed, source-report.md.
// Usage: node scripts/check-sources.mjs [--dry]   (--dry only lists the URLs)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const root = new URL('../', import.meta.url);
const read = p => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const FILES = ['pathways', 'study', 'milestones'];

function collect(node, found = new Set()) {
  if (Array.isArray(node)) node.forEach(n => collect(n, found));
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k === 'url' && typeof v === 'string' && v.startsWith('http')) found.add(v);
      else collect(v, found);
    }
  }
  return found;
}

const urls = [...new Set(FILES.flatMap(f => [...collect(read(`data/${f}.json`))]))].sort();
if (process.argv.includes('--dry')) {
  console.log(urls.join('\n'));
  console.log(`\n${urls.length} URLs`);
  process.exit(0);
}

const statusPath = new URL('data/source-status.json', root);
const previous = existsSync(statusPath) ? JSON.parse(readFileSync(statusPath, 'utf8')) : { sources: {} };
const now = new Date().toISOString();
const next = { checkedAt: now, sources: {} };

const fingerprint = body => createHash('sha256').update(
  body.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 300000)
).digest('hex');

async function check(url) {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(25000),
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; medpath-source-watch/1.0)' }
    });
    if (!res.ok) return { state: 'error', http: res.status, checkedAt: now };
    const hash = fingerprint(await res.text());
    const before = previous.sources[url]?.hash;
    const state = !before ? 'new' : before === hash ? 'ok' : 'changed';
    return { state, http: res.status, hash, checkedAt: now, changedAt: state === 'changed' ? now : previous.sources[url]?.changedAt };
  } catch (e) {
    return { state: 'error', http: 0, error: String(e.message || e).slice(0, 120), checkedAt: now };
  }
}

for (const url of urls) next.sources[url] = await check(url);
writeFileSync(statusPath, JSON.stringify(next, null, 2) + '\n');

const flagged = Object.entries(next.sources).filter(([, s]) => s.state === 'changed' || s.state === 'error');
if (flagged.length) {
  const lines = flagged.map(([u, s]) => `- **${s.state === 'changed' ? 'تغییر کرده' : 'خطا'}** ${u}${s.http ? ` (HTTP ${s.http})` : ''}`);
  writeFileSync(new URL('source-report.md', root), [
    `بررسی خودکار منابع در ${now.slice(0, 10)}`,
    '',
    ...lines,
    '',
    'صفحات پویا ممکن است بدون تغییر محتوایی هم «تغییر کرده» نشان داده شوند. هر مورد را باز کن، اگر شرایط عوض شده data/*.json و تاریخ verified را به‌روز کن.'
  ].join('\n') + '\n');
}
console.log(`${urls.length} sources checked, ${flagged.length} flagged`);
