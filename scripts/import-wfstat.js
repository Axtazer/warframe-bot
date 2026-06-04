'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const { Pool } = require('pg');

const WFSTAT  = 'https://api.warframestat.us';
const HEADERS = { 'User-Agent': 'WarframeBot-Import/1.0 (github.com/Axtazer/warframe-bot)' };

const pool = new Pool({
  host:     process.env.POSTGRES_HOST     ?? 'localhost',
  port:     parseInt(process.env.POSTGRES_PORT ?? '5432'),
  database: process.env.POSTGRES_DB       ?? 'warframe',
  user:     process.env.POSTGRES_USER     ?? 'warframe',
  password: process.env.POSTGRES_PASSWORD,
});

async function fetchEndpoint(path) {
  const res = await fetch(`${WFSTAT}${path}?language=en`, { headers: HEADERS });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json();
}

function buildSearchVec(item, category) {
  const parts = [
    item.name ?? '',
    item.description ?? '',
    item.type ?? '',
    item.compatName ?? '',
    category,
    (item.abilities ?? []).map(a => `${a.name} ${a.description}`).join(' '),
    (item.levelStats ?? []).flatMap(l => l.stats ?? []).join(' '),
    item.passiveDescription ?? '',
    item.effect ?? '',
  ];
  return parts.filter(Boolean).join(' ').slice(0, 10000);
}

async function upsert(records) {
  for (const r of records) {
    const vec = buildSearchVec(r.data, r.category);
    await pool.query(
      `INSERT INTO wf_knowledge (unique_name, name, category, data, search_vec, updated_at)
       VALUES ($1, $2, $3, $4, to_tsvector('english', $5), NOW())
       ON CONFLICT (unique_name) DO UPDATE SET
         name       = EXCLUDED.name,
         category   = EXCLUDED.category,
         data       = EXCLUDED.data,
         search_vec = EXCLUDED.search_vec,
         updated_at = NOW()`,
      [r.uniqueName, r.name, r.category, JSON.stringify(r.data), vec]
    );
  }
}

async function main() {
  console.log('[WFSTAT] Import démarrage...');

  // Les endpoints spécialisés ont plus de données que /items/ pour leurs types
  const [mods, warframes, weapons, arcanes, items] = await Promise.all([
    fetchEndpoint('/mods'),
    fetchEndpoint('/warframes'),
    fetchEndpoint('/weapons'),
    fetchEndpoint('/arcanes'),
    fetchEndpoint('/items'),
  ]);

  console.log(`[WFSTAT] mods:${mods.length} frames:${warframes.length} weapons:${weapons.length} arcanes:${arcanes.length} items:${items.length}`);

  // Construire un set des uniqueNames déjà couverts par les endpoints spécialisés
  const specialized = new Set([
    ...mods.map(m => m.uniqueName),
    ...warframes.map(f => f.uniqueName),
    ...weapons.map(w => w.uniqueName),
    ...arcanes.map(a => a.uniqueName ?? a.name),
  ]);

  // Endpoints spécialisés — données prioritaires
  const records = [
    ...mods.map(d => ({ uniqueName: d.uniqueName, name: d.name, category: 'mod', data: d })),
    ...warframes.map(d => ({ uniqueName: d.uniqueName, name: d.name, category: 'warframe', data: d })),
    ...weapons.map(d => ({ uniqueName: d.uniqueName, name: d.name, category: 'weapon', data: d })),
    ...arcanes.map(d => ({ uniqueName: d.uniqueName ?? d.name, name: d.name, category: 'arcane', data: d })),
    // /items/ uniquement pour ce qui n'est pas déjà couvert
    ...items
      .filter(i => i.uniqueName && !specialized.has(i.uniqueName))
      .map(d => ({ uniqueName: d.uniqueName, name: d.name, category: (d.category ?? 'item').toLowerCase(), data: d })),
  ].filter(r => r.name);

  console.log(`[WFSTAT] ${records.length} records à upsert...`);
  await upsert(records);
  console.log(`[WFSTAT] ✓ Import terminé — ${records.length} items en DB.`);
  await pool.end();
}

main().catch(e => { console.error('[WFSTAT] Fatal:', e); process.exit(1); });
