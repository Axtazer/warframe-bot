const { pool } = require('../database');
const { searchModsByType } = require('./gameData');
const HEADERS  = { 'User-Agent': 'WarframeDiscordBot/1.0' };
const liveCache = new Map();
const LIVE_TTL  = 30 * 60 * 1000;

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ── Formatage commun ──────────────────────────────────────────────────────────

function formatBuilds(itemName, builds) {
  if (!builds.length) return `Aucun build trouvé pour "${itemName}".`;

  const modCount = {};
  for (const b of builds) {
    for (const m of (b.mods ?? [])) modCount[m] = (modCount[m] || 0) + 1;
  }
  const most_used_mods = Object.entries(modCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, count]) => ({ name, popularity: `${Math.round(count / builds.length * 100)}%` }));

  const top_community_builds = builds.slice(0, 3).map(b => {
    const entry = { title: b.build_title ?? b.title, rating: b.rating ?? 0, mods: b.mods ?? [] };
    if (b.helminth) entry.helminth_substitute = b.helminth;
    return entry;
  });

  return JSON.stringify({ item: itemName, most_used_mods, top_community_builds });
}

// ── Source 1 : PostgreSQL (pré-scrapé) ───────────────────────────────────────

async function searchBuildsDB(query) {
  const { rows } = await pool.query(
    `SELECT build_title, mods, helminth, rating, tags
     FROM warframe_builds
     WHERE LOWER(item_name) = LOWER($1)
     ORDER BY rating DESC
     LIMIT 10`,
    [query]
  );
  return rows;
}

// ── Source 2 : Overframe live (fallback) ──────────────────────────────────────

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

async function searchBuildsLive(query) {
  const slug = slugify(query);
  for (const category of ['warframes', 'weapons']) {
    const nextData = await fetchNextData(`https://overframe.gg/${category}/${slug}/`).catch(() => null);
    if (!nextData) continue;

    const pp     = nextData?.props?.pageProps ?? {};
    const raw    = pp.builds ?? pp.topBuilds ?? pp.data?.builds ?? pp[category.slice(0,-1)]?.builds ?? [];
    const builds = Array.isArray(raw) ? raw : [];
    if (!builds.length) continue;

    const normalized = builds.slice(0, 10).map(b => {
      const hr = b.helminthAbility ?? b.helminth ?? b.helminthSlot;
      return {
        build_title: (b.title ?? b.name ?? 'Build communautaire').slice(0, 254),
        rating:      b.upvotes ?? b.score ?? b.rating ?? 0,
        mods:        extractMods(b),
        helminth:    hr ? (typeof hr === 'string' ? hr : hr.name ?? null) : null,
      };
    }).filter(b => b.mods.length > 0);

    if (normalized.length) return normalized;
  }
  return [];
}

// ── Point d'entrée exposé à l'agent ──────────────────────────────────────────

async function searchBuilds(query) {
  // 1. Cache mémoire (live uniquement)
  const cacheKey = query.toLowerCase();
  const hit = liveCache.get(cacheKey);
  if (hit && Date.now() - hit.ts < LIVE_TTL) return hit.data;

  // 2. DB locale (pré-scrapé la nuit)
  const dbBuilds = await searchBuildsDB(query).catch(() => []);
  if (dbBuilds.length) return formatBuilds(query, dbBuilds);

  // 3. Fallback live Overframe
  const liveBuilds = await searchBuildsLive(query);
  if (liveBuilds.length) {
    const data = formatBuilds(query, liveBuilds);
    liveCache.set(cacheKey, { data, ts: Date.now() });
    return data;
  }

  // Fallback enrichi : stats réelles depuis la DB locale
  const { rows } = await pool.query(
    `SELECT category, data FROM wf_knowledge WHERE LOWER(name) = LOWER($1) LIMIT 1`,
    [query]
  ).catch(() => ({ rows: [] }));

  if (rows.length) {
    const item = rows[0].data;
    const cat  = rows[0].category;
    let info = `[Aucun build communautaire disponible pour "${query}" — base-toi sur ces stats réelles]\n`;
    info += `Catégorie : ${cat}\n`;
    if (cat === 'weapon') {
      if (item.totalDamage)        info += `Dégâts totaux : ${item.totalDamage}\n`;
      if (item.criticalChance)     info += `Crit : ${Math.round(item.criticalChance * 100)}%\n`;
      if (item.criticalMultiplier) info += `Multi crit : ${item.criticalMultiplier}x\n`;
      if (item.procChance)         info += `Status : ${Math.round(item.procChance * 100)}%\n`;
      if (item.fireRate)           info += `Cadence : ${item.fireRate.toFixed(1)}\n`;
      if (item.magazineSize)       info += `Chargeur : ${item.magazineSize}\n`;
      if (item.productCategory)    info += `Type de mod compatible : ${item.productCategory}\n`;
    } else if (cat === 'warframe') {
      if (item.health)  info += `Santé : ${item.health}\n`;
      if (item.shield)  info += `Bouclier : ${item.shield}\n`;
      if (item.armor)   info += `Armure : ${item.armor}\n`;
      if (item.power)   info += `Énergie : ${item.power}\n`;
      if (item.abilities?.length) {
        info += `Capacités : ${item.abilities.map(a => a.name).join(', ')}\n`;
      }
    }
    info += `Overframe : https://overframe.gg/search/?query=${encodeURIComponent(query)}\n\n`;

    // Injecter le catalogue de mods compatibles directement
    const modType = cat === 'warframe' ? 'Warframe'
      : item.productCategory === 'LongGuns' ? 'Rifle'
      : item.productCategory === 'Pistols'  ? 'Pistol'
      : item.productCategory === 'Melee'    ? 'Melee'
      : item.productCategory === 'Shotguns' ? 'Shotgun'
      : null;

    if (modType) {
      const modCatalog = await searchModsByType(modType).catch(() => null);
      if (modCatalog) info += modCatalog;
    }
    return info;
  }

  return `Aucune donnée disponible pour "${query}". Consulte : https://overframe.gg/search/?query=${encodeURIComponent(query)}`;
}

module.exports = { searchBuilds };
