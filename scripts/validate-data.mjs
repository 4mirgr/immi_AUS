// Validates data/*.json. Run: node scripts/validate-data.mjs
import { readFileSync } from 'node:fs';

const errors = [];
const load = name => {
  try { return JSON.parse(readFileSync(new URL(`../data/${name}.json`, import.meta.url), 'utf8')); }
  catch (e) { errors.push(`${name}.json: ${e.message}`); return null; }
};

const meta = load('meta');
const pathways = load('pathways');
const study = load('study');
const tasks = load('tasks');
const milestones = load('milestones');
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const isUrl = s => /^https:\/\/\S+$/.test(s);
const KINDS = ['official', 'secondary', 'commercial'];
const LEVELS = ['yes', 'partial', 'no', 'unverified'];

function checkSources(where, list) {
  if (!Array.isArray(list) || list.length === 0) return errors.push(`${where}: sources missing`);
  for (const s of list) {
    if (!s.title) errors.push(`${where}: source without title`);
    if (!isUrl(s.url || '')) errors.push(`${where}: bad url ${s.url}`);
    if (!KINDS.includes(s.kind)) errors.push(`${where}: source kind must be one of ${KINDS}`);
  }
}

if (meta) {
  if (!isDate(meta.lastVerified)) errors.push('meta.lastVerified must be YYYY-MM-DD');
  if (!isDate(meta.boardDateDefault)) errors.push('meta.boardDateDefault must be YYYY-MM-DD');
}
const criteria = meta ? meta.criteria.map(c => c.id) : [];
const cats = meta ? meta.categories.map(c => c.id) : [];
const ids = new Set();

for (const [file, list] of [['pathways', pathways], ['study', study]]) {
  if (!list) continue;
  for (const p of list) {
    const where = `${file}/${p.id}`;
    if (ids.has(p.id)) errors.push(`${where}: duplicate id`);
    ids.add(p.id);
    if (!LEVELS.includes(p.level)) errors.push(`${where}: level must be one of ${LEVELS}`);
    if (!p.name) errors.push(`${where}: name missing`);
    if (!isDate(p.verified)) errors.push(`${where}: verified must be YYYY-MM-DD`);
    checkSources(where, p.sources);
    if (p.scores !== null) {
      for (const c of criteria) {
        const v = p.scores?.[c];
        if (!Number.isInteger(v) || v < 1 || v > 5) errors.push(`${where}: score ${c} must be an integer 1-5`);
      }
    }
  }
}
if (tasks) {
  const t = new Set();
  for (const x of tasks) {
    if (t.has(x.id)) errors.push(`tasks/${x.id}: duplicate id`);
    t.add(x.id);
    if (!cats.includes(x.cat)) errors.push(`tasks/${x.id}: unknown category ${x.cat}`);
    if (!['high', 'mid', 'low'].includes(x.prio)) errors.push(`tasks/${x.id}: bad prio`);
    if (x.due && !isDate(x.due)) errors.push(`tasks/${x.id}: bad due`);
  }
}
if (milestones) {
  for (const m of milestones) {
    if (!isDate(m.date)) errors.push(`milestones/${m.id}: bad date`);
    if (!['estimate', 'confirmed'].includes(m.kind)) errors.push(`milestones/${m.id}: kind must be estimate or confirmed`);
    checkSources(`milestones/${m.id}`, [m.source]);
  }
}

if (errors.length) {
  console.error(errors.map(e => `✗ ${e}`).join('\n'));
  process.exit(1);
}
console.log('✓ data files are valid');
