'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const { Pool } = require('pg');

const HEADERS  = { 'User-Agent': 'WarframeBot-Scraper/1.0 (homelab; github.com/Axtazer/warframe-bot)' };
const DELAY_MS = 400;        // ~2-3 req/s, dans les clous d'Overframe
const MAX_ID   = 6600;       // marge au-dessus des 6554 connus
const BASE_URL = 'https://overframe.gg/items/arsenal';

const pool = new Pool({
  host:     process.env.POSTGRES_HOST     ?? 'localhost',
  port:     parseInt(process.env.POSTGRES_PORT ?? '5432'),
  database: process.env.POSTGRES_DB       ?? 'warframe',
  user:     process.env.POSTGRES_USER     ?? 'warframe',
  password: process.env.POSTGRES_PASSWORD,
});

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchNextData(id) {
  const res = await fetch(`${BASE_URL}/${id}`, { headers: HEADERS });
  if (!res.ok) return null;
  const html = await res.text();
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) return null;
  return JSON.parse(match[1]);
}

function extractModName(m) {
  if (!m) return '';
  return typeof m === 'string' ? m : (m.name ?? m.title ?? m.modName ?? '');
}

function extractMods(build) {
  const raw = build.mods ?? build.modLoadout ?? build.modules ?? build.config ?? build.items ?? [];
  return Array.isArray(raw) ? raw.map(extractModName).filter(Boolean).slice(0, 8) : [];
}

function inferTags(title) {
  const t = title.toLowerCase();
  const tags = [];
  if (t.includes('steel path') || t.includes('steel-path')) tags.push('steel_path');
  if (t.includes('eso') || t.includes('sanctuary onslaught'))  tags.push('eso');
  if (t.includes('budget') || t.includes('starter'))           tags.push('budget');
  if (t.includes('endur') || t.includes('survival'))           tags.push('endurance');
  if (t.includes('speed') || t.includes('sprint'))             tags.push('speed');
  if (t.includes('nuke') || t.includes('aoe'))                 tags.push('nuke');
  return tags;
}

function inferType(item) {
  if (!item) return 'unknown';
  if (item.abilities || item.health !== undefined) return 'warframe';
  if (item.totalDamage || item.fireRate !== undefined) return 'weapon';
  const cat = (item.category ?? item.productCategory ?? '').toLowerCase();
  if (cat.includes('warframe') || cat.includes('suit')) return 'warframe';
  return 'weapon';
}

async function processId(id) {
  const nextData = await fetchNextData(id).catch(() => null);
  if (!nextData) return null;

  const pp   = nextData?.props?.pageProps ?? {};
  const item = pp.item ?? pp.warframe ?? pp.weapon;
  if (!item?.name) return null;

  // Debug structure sur les 3 premiers items trouvés
  if (id <= 10) {
    process.stderr.write(`[DEBUG] ID ${id} (${item.name}) pageProps keys: ${JSON.stringify(Object.keys(pp))}\n`);
  }

  const rawBuilds = pp.builds ?? pp.topBuilds ?? pp.data?.builds ?? item.builds ?? [];
  if (!Array.isArray(rawBuilds) || !rawBuilds.length) return { name: item.name, type: inferType(item), builds: [] };

  const builds = rawBuilds.slice(0, 10).map(b => {
    const hr = b.helminthAbility ?? b.helminth ?? b.helminthSlot;
    return {
      title:    (b.title ?? b.name ?? 'Build communautaire').slice(0, 254),
      rating:   b.upvotes ?? b.score ?? b.rating ?? 0,
      mods:     extractMods(b),
      helminth: hr ? (typeof hr === 'string' ? hr : hr.name ?? null) : null,
    };
  }).filter(b => b.mods.length > 0);

  return { name: item.name, type: inferType(item), builds };
}

async function main() {
  const startId = parseInt(process.argv[2] ?? '1');
  const endId   = parseInt(process.argv[3] ?? String(MAX_ID));

  console.log(`[SCRAPER] IDs ${startId} → ${endId} (~${Math.ceil((endId - startId) * DELAY_MS / 60000)} min)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS warframe_builds (
      id SERIAL PRIMARY KEY, item_name VARCHAR(100) NOT NULL,
      item_type VARCHAR(20) NOT NULL, build_title VARCHAR(255) NOT NULL,
      mods JSONB NOT NULL, helminth VARCHAR(100),
      rating INT DEFAULT 0, tags JSONB DEFAULT '[]'::jsonb,
      scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT unique_item_build UNIQUE (item_name, build_title)
    );
    CREATE INDEX IF NOT EXISTS idx_builds_item_name ON warframe_builds(item_name);
  `);

  let totalBuilds = 0, itemsWithBuilds = 0;

  for (let id = startId; id <= endId; id++) {
    try {
      const result = await processId(id);
      if (!result) { await sleep(DELAY_MS); continue; }

      const { name, type, builds } = result;
      let upserted = 0;

      for (const b of builds) {
        await pool.query(
          `INSERT INTO warframe_builds (item_name, item_type, build_title, mods, helminth, rating, tags)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (item_name, build_title) DO UPDATE SET
             mods=EXCLUDED.mods, helminth=EXCLUDED.helminth,
             rating=EXCLUDED.rating, tags=EXCLUDED.tags, scraped_at=NOW()`,
          [name, type, b.title, JSON.stringify(b.mods), b.helminth, b.rating, JSON.stringify(inferTags(b.title))]
        );
        upserted++;
      }

      if (upserted > 0) {
        process.stdout.write(`[${id}] ✓ ${name} (${type}) — ${upserted} builds\n`);
        totalBuilds += upserted;
        itemsWithBuilds++;
      }
    } catch (e) {
      process.stderr.write(`[${id}] ✗ ${e.message}\n`);
    }
    await sleep(DELAY_MS);
  }

  console.log(`[SCRAPER] Terminé : ${itemsWithBuilds} items, ${totalBuilds} builds en DB.`);
  await pool.end();
}

main().catch(e => { console.error('[SCRAPER] Fatal:', e); process.exit(1); });
