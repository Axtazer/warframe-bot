'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const { Pool } = require('pg');

const API     = 'https://warframe.fandom.com/api.php';
const HEADERS = { 'User-Agent': 'WarframeBot-Import/1.0 (github.com/Axtazer/warframe-bot)' };
const BATCH   = 20;   // pages par requête de contenu
const DELAY   = 200;  // ms entre requêtes

const pool = new Pool({
  host:     process.env.POSTGRES_HOST     ?? 'localhost',
  port:     parseInt(process.env.POSTGRES_PORT ?? '5432'),
  database: process.env.POSTGRES_DB       ?? 'warframe',
  user:     process.env.POSTGRES_USER     ?? 'warframe',
  password: process.env.POSTGRES_PASSWORD,
});

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Nettoyage wikitext → texte lisible pour tsvector
function stripWikitext(text) {
  return text
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
    .replace(/<ref[^/]*\/>/gi, '')
    .replace(/\[\[(File|Image):[^\]]+\]\]/gi, '')
    .replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g, '$1')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\{\{[^{}]*\}\}/g, m => {          // templates simples → extraire valeurs
      return m.replace(/^\{\{|\}\}$/g, '').split('|')
        .slice(1).map(p => p.includes('=') ? p.split('=').slice(1).join('=') : p).join(' ');
    })
    .replace(/\{\{[\s\S]*?\}\}/g, '')           // templates imbriqués restants
    .replace(/<[^>]+>/g, ' ')                   // balises HTML
    .replace(/'{2,3}/g, '')
    .replace(/==+([^=]+)==+/g, '\n$1\n')
    .replace(/\[\s*https?:\/\/[^\s\]]+\s*([^\]]*)\]/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function fetchJson(params) {
  const url = `${API}?${new URLSearchParams({ format: 'json', ...params })}`;
  const res  = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`API → ${res.status}`);
  return res.json();
}

async function* allPageTitles() {
  let apcontinue;
  do {
    const params = { action: 'query', list: 'allpages', aplimit: 500, apfilterredir: 'nonredirects', apnamespace: 0 };
    if (apcontinue) params.apcontinue = apcontinue;
    const data = await fetchJson(params);
    for (const p of data.query?.allpages ?? []) yield p.title;
    apcontinue = data.continue?.apcontinue;
    await sleep(DELAY);
  } while (apcontinue);
}

async function fetchPageContents(titles) {
  const data = await fetchJson({
    action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main',
    titles: titles.join('|'),
  });
  return Object.values(data.query?.pages ?? {}).map(p => ({
    title:   p.title,
    content: p.revisions?.[0]?.slots?.main?.['*'] ?? p.revisions?.[0]?.['*'] ?? '',
  })).filter(p => p.content);
}

async function upsertPages(pages) {
  for (const p of pages) {
    const clean = stripWikitext(p.content).slice(0, 100000);
    if (clean.length < 50) continue;
    const vecText = `${p.title} ${clean}`.slice(0, 10000);
    await pool.query(
      `INSERT INTO wiki_pages (title, content, search_vec, updated_at)
       VALUES ($1, $2, to_tsvector('english', $3), NOW())
       ON CONFLICT (title) DO UPDATE SET
         content    = EXCLUDED.content,
         search_vec = EXCLUDED.search_vec,
         updated_at = NOW()`,
      [p.title, clean, vecText]
    );
  }
}

async function main() {
  console.log('[WIKI] Import démarrage...');

  // Collecter tous les titres
  const titles = [];
  for await (const title of allPageTitles()) titles.push(title);
  console.log(`[WIKI] ${titles.length} pages à importer...`);

  let done = 0;
  for (let i = 0; i < titles.length; i += BATCH) {
    const batch = titles.slice(i, i + BATCH);
    try {
      const pages = await fetchPageContents(batch);
      await upsertPages(pages);
      done += pages.length;
      if (done % 500 === 0) process.stdout.write(`[WIKI] ${done}/${titles.length}\n`);
    } catch (e) {
      process.stderr.write(`[WIKI] Batch ${i}: ${e.message}\n`);
    }
    await sleep(DELAY);
  }

  console.log(`[WIKI] ✓ Import terminé — ${done} pages en DB.`);
  await pool.end();
}

main().catch(e => { console.error('[WIKI] Fatal:', e); process.exit(1); });
