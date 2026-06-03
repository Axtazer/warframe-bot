const BASE = 'https://drops.warframestat.us/data';
const HEADERS = { 'User-Agent': 'WarframeDiscordBot/1.0' };

let dropsCache = null;
let dropsCacheTs = 0;
const TTL = 3_600_000;

async function loadDrops() {
  const now = Date.now();
  if (dropsCache && now - dropsCacheTs < TTL) return dropsCache;
  const res = await fetch(`${BASE}/all.slim.json`, { headers: HEADERS });
  if (!res.ok) throw new Error(`drops.warframestat.us → ${res.status}`);
  dropsCache = await res.json();
  dropsCacheTs = now;
  return dropsCache;
}

function normalize(str) {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function searchDrops(query) {
  const drops = await loadDrops();
  const q = normalize(query);
  const matches = drops.filter(d => normalize(d.item ?? '').includes(q));

  if (!matches.length) return `Aucun drop trouvé pour "${query}".`;

  const grouped = {};
  for (const d of matches) {
    if (!grouped[d.item]) grouped[d.item] = [];
    grouped[d.item].push(d);
  }

  const entries = Object.entries(grouped);
  let out = `**Drops pour "${query}"** (${entries.length} item(s))\n`;

  for (const [item, sources] of entries.slice(0, 3)) {
    out += `\n**${item}**\n`;
    out += sources
      .sort((a, b) => b.chance - a.chance)
      .slice(0, 6)
      .map(s => `• ${s.place} — ${s.rarity} **(${(s.chance * 100).toFixed(2)}%)**`)
      .join('\n');
    if (sources.length > 6) out += `\n_... et ${sources.length - 6} autres sources_`;
    out += '\n';
  }
  if (entries.length > 3) out += `\n_... et ${entries.length - 3} autres items_`;

  return out;
}

module.exports = { searchDrops };
