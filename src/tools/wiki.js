const BASE = 'https://warframe.fandom.com/api.php';
const HEADERS = { 'User-Agent': 'WarframeDiscordBot/1.0' };

const wikiCache = new Map();
const CACHE_TTL = 30 * 60 * 1000;

async function executeWikiQuery(query) {
  const searchRes = await fetch(
    `${BASE}?action=opensearch&search=${encodeURIComponent(query)}&limit=3&format=json`,
    { headers: HEADERS }
  );
  if (!searchRes.ok) throw new Error(`Wiki search → ${searchRes.status}`);
  const [, titles, , urls] = await searchRes.json();
  if (!titles.length) return `Aucun article trouvé pour "${query}".`;

  const pageRes = await fetch(
    `${BASE}?action=query&titles=${encodeURIComponent(titles[0])}&prop=extracts&exintro=1&exchars=1500&format=json`,
    { headers: HEADERS }
  );
  if (!pageRes.ok) throw new Error(`Wiki page → ${pageRes.status}`);
  const data = await pageRes.json();
  const page = Object.values(data.query.pages)[0];

  if (!page || page.missing !== undefined) {
    return `Article "${titles[0]}" introuvable sur le wiki.`;
  }

  const extract = (page.extract ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 1000);

  return `**${titles[0]}** — ${urls[0]}\n\n${extract || '_Aucun résumé disponible._'}`;
}

async function searchWiki(query) {
  const now = Date.now();
  const cached = wikiCache.get(query);
  if (cached && now - cached.timestamp < CACHE_TTL) return cached.data;

  const result = await executeWikiQuery(query);
  wikiCache.set(query, { data: result, timestamp: now });
  return result;
}

module.exports = { searchWiki };
