const { pool } = require('../database');
const HEADERS  = { 'User-Agent': 'WarframeDiscordBot/1.0' };
const liveCache = new Map();
const CACHE_TTL = 30 * 60 * 1000;

// ── DB locale (wiki_pages) ────────────────────────────────────────────────────

async function searchWikiDB(query) {
  const { rows } = await pool.query(
    `SELECT title, content FROM wiki_pages
     WHERE search_vec @@ plainto_tsquery('english', $1)
        OR LOWER(title) LIKE LOWER($2)
     ORDER BY LOWER(title) = LOWER($1) DESC,
              ts_rank(search_vec, plainto_tsquery('english', $1)) DESC
     LIMIT 1`,
    [query, `%${query}%`]
  );
  return rows;
}

// ── Fallback live Fandom ──────────────────────────────────────────────────────

async function searchWikiLive(query) {
  const cached = liveCache.get(query);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  const BASE = 'https://warframe.fandom.com/api.php';
  const searchRes = await fetch(
    `${BASE}?action=opensearch&search=${encodeURIComponent(query)}&limit=3&format=json`,
    { headers: HEADERS }
  );
  if (!searchRes.ok) throw new Error(`Wiki search → ${searchRes.status}`);
  const [, titles, , urls] = await searchRes.json();
  if (!titles?.length) return `Aucun résultat wiki pour "${query}".`;

  const pageRes = await fetch(
    `${BASE}?action=query&titles=${encodeURIComponent(titles[0])}&prop=extracts&exintro=1&exchars=1500&format=json`,
    { headers: HEADERS }
  );
  if (!pageRes.ok) throw new Error(`Wiki page → ${pageRes.status}`);
  const data = await pageRes.json();
  const page = Object.values(data.query?.pages ?? {})[0];
  if (!page || page.missing !== undefined) return `Article "${titles[0]}" introuvable.`;

  const extract = (page.extract ?? '').replace(/<[^>]+>/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, 1000);
  const result  = `**${titles[0]}** — ${urls[0]}\n\n${extract || '_Aucun résumé disponible._'}`;
  liveCache.set(query, { data: result, ts: Date.now() });
  return result;
}

// ── Point d'entrée ────────────────────────────────────────────────────────────

async function searchWiki(query) {
  const rows = await searchWikiDB(query).catch(() => []);
  if (rows.length) {
    return rows.map(r => `**${r.title}**\n${r.content.replace(/\n{2,}/g, '\n')}`).join('\n\n').trim();
  }
  return searchWikiLive(query);
}

module.exports = { searchWiki };
