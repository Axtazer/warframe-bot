const HEADERS = { 'User-Agent': 'WarframeDiscordBot/1.0' };
const cache = new Map();
const TTL = 30 * 60 * 1000;

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
  if (typeof m === 'string') return m;
  return m.name ?? m.title ?? m.modName ?? m.uniqueName?.split('/').pop() ?? '';
}

function extractMods(build) {
  const raw = build.mods ?? build.modLoadout ?? build.modules ?? build.config ?? [];
  if (!Array.isArray(raw)) return [];
  return raw.map(extractModName).filter(Boolean).slice(0, 8);
}

function condensBuilds(nextData, query) {
  const pageProps = nextData?.props?.pageProps ?? {};

  // Overframe peut stocker les builds sous différentes clés selon le type de page
  const builds =
    pageProps.builds ??
    pageProps.topBuilds ??
    pageProps.data?.builds ??
    pageProps.warframe?.builds ??
    pageProps.weapon?.builds ??
    [];

  if (!Array.isArray(builds) || !builds.length) return null;

  // Popularité des mods sur les N premiers builds
  const modCount = {};
  const sample = builds.slice(0, 20);
  for (const b of sample) {
    for (const mod of extractMods(b)) {
      modCount[mod] = (modCount[mod] || 0) + 1;
    }
  }
  const most_used_mods = Object.entries(modCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, count]) => ({
      name,
      popularity: `${Math.round((count / sample.length) * 100)}%`,
    }));

  const top_community_builds = builds.slice(0, 3).map(b => {
    const entry = {
      title:  b.title ?? b.name ?? 'Build communautaire',
      rating: b.upvotes ?? b.score ?? b.rating ?? 0,
      mods:   extractMods(b),
    };
    const helminth = b.helminthAbility ?? b.helminth ?? b.helminthSlot;
    if (helminth) entry.helminth_substitute = typeof helminth === 'string' ? helminth : helminth.name;
    return entry;
  }).filter(b => b.mods.length > 0);

  if (!top_community_builds.length) return null;
  return { item: query, most_used_mods, top_community_builds };
}

async function searchBuilds(query) {
  const key = query.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < TTL) return hit.data;

  const slug = slugify(query);
  const urls = [
    `https://overframe.gg/warframes/${slug}/`,
    `https://overframe.gg/weapons/${slug}/`,
  ];

  for (const url of urls) {
    const nextData = await fetchNextData(url).catch(() => null);
    if (!nextData) continue;
    const condensed = condensBuilds(nextData, query);
    if (condensed) {
      const data = JSON.stringify(condensed);
      cache.set(key, { data, ts: Date.now() });
      return data;
    }
  }

  // Fallback : lien de recherche si le parsing échoue
  return `Impossible de récupérer les builds automatiquement. Consulte : https://overframe.gg/search/?query=${encodeURIComponent(query)}`;
}

module.exports = { searchBuilds };
