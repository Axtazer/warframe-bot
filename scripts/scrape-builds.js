'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const { Pool } = require('pg');

const HEADERS  = { 'User-Agent': 'WarframeBot-Scraper/1.0 (homelab; github.com/Axtazer/warframe-bot)' };
const DELAY_MS = 2500;
const WFSTAT   = 'https://api.warframestat.us';

const pool = new Pool({
  host:     process.env.POSTGRES_HOST     ?? 'localhost',
  port:     parseInt(process.env.POSTGRES_PORT ?? '5432'),
  database: process.env.POSTGRES_DB       ?? 'warframe',
  user:     process.env.POSTGRES_USER     ?? 'warframe',
  password: process.env.POSTGRES_PASSWORD,
});

const sleep = ms => new Promise(r => setTimeout(r, ms));

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function fetchNextData(url) {
  const res = await fetch(url, { headers: HEADERS });
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
  const raw = build.mods ?? build.modLoadout ?? build.modules ?? build.config ?? [];
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

async function scrapeItem(name, itemType) {
  const slug     = slugify(name);
  const category = itemType === 'warframe' ? 'warframes' : 'weapons';
  const nextData = await fetchNextData(`https://overframe.gg/${category}/${slug}/`).catch(() => null);
  if (!nextData) return 0;

  const pp   = nextData?.props?.pageProps ?? {};
  const raw  = pp.builds ?? pp.topBuilds ?? pp.data?.builds ?? pp[category.slice(0,-1)]?.builds ?? [];
  const builds = Array.isArray(raw) ? raw : [];
  if (!builds.length) return 0;

  let upserted = 0;
  for (const build of builds.slice(0, 10)) {
    const mods = extractMods(build);
    if (!mods.length) continue;

    const title    = (build.title ?? build.name ?? 'Build communautaire').slice(0, 254);
    const rating   = build.upvotes ?? build.score ?? build.rating ?? 0;
    const hr       = build.helminthAbility ?? build.helminth ?? build.helminthSlot;
    const helminth = hr ? (typeof hr === 'string' ? hr : hr.name ?? null) : null;
    const tags     = inferTags(title);

    await pool.query(
      `INSERT INTO warframe_builds (item_name, item_type, build_title, mods, helminth, rating, tags)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (item_name, build_title) DO UPDATE SET
         mods       = EXCLUDED.mods,
         helminth   = EXCLUDED.helminth,
         rating     = EXCLUDED.rating,
         tags       = EXCLUDED.tags,
         scraped_at = NOW()`,
      [name, itemType, title, JSON.stringify(mods), helminth, rating, JSON.stringify(tags)]
    );
    upserted++;
  }
  return upserted;
}

async function fetchItemList(endpoint) {
  const res = await fetch(`${WFSTAT}/${endpoint}/?language=en`, { headers: HEADERS });
  if (!res.ok) throw new Error(`warframestat.us /${endpoint} → ${res.status}`);
  const data = await res.json();
  return [...new Set(data.map(i => i.name).filter(Boolean))];
}

async function main() {
  const args = process.argv.slice(2);
  const onlyWarframes = args.includes('--warframes-only');
  const onlyWeapons   = args.includes('--weapons-only');

  console.log('[SCRAPER] Démarrage...');

  // Garantir que la table existe (idempotent)
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

  const targets = [];

  if (!onlyWeapons) {
    const frames = await fetchItemList('warframes');
    console.log(`[SCRAPER] ${frames.length} Warframes`);
    frames.forEach(n => targets.push({ name: n, type: 'warframe' }));
  }

  if (!onlyWarframes) {
    const weapons = await fetchItemList('weapons');
    console.log(`[SCRAPER] ${weapons.length} Armes`);
    weapons.forEach(n => targets.push({ name: n, type: 'weapon' }));
  }

  console.log(`[SCRAPER] Total : ${targets.length} items à scraper (~${Math.ceil(targets.length * DELAY_MS / 60000)} min)`);

  let totalBuilds = 0, scraped = 0;

  for (let i = 0; i < targets.length; i++) {
    const { name, type } = targets[i];
    try {
      const count = await scrapeItem(name, type);
      if (count > 0) {
        process.stdout.write(`[${i+1}/${targets.length}] ✓ ${name} — ${count} builds\n`);
        totalBuilds += count;
        scraped++;
      }
    } catch (e) {
      process.stderr.write(`[${i+1}/${targets.length}] ✗ ${name}: ${e.message}\n`);
    }
    await sleep(DELAY_MS);
  }

  console.log(`[SCRAPER] Terminé : ${scraped}/${targets.length} items, ${totalBuilds} builds en DB.`);
  await pool.end();
}

main().catch(e => { console.error('[SCRAPER] Fatal:', e); process.exit(1); });
