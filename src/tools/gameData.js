const { pool } = require('../database');
const WFSTAT   = 'https://api.warframestat.us';
const CALAMITY = 'https://raw.githubusercontent.com/calamity-inc/warframe-public-export-plus/master';
const HEADERS  = { 'User-Agent': 'WarframeDiscordBot/1.0' };

// ── Cache calamity-inc (uniqueName → inventaire uniquement) ──────────────────
const exportCache = new Map();
const EXPORT_TTL  = 3_600_000;

async function loadExport(filename) {
  const now = Date.now();
  if (exportCache.has(filename) && now - exportCache.get(filename).ts < EXPORT_TTL)
    return exportCache.get(filename).data;
  const res = await fetch(`${CALAMITY}/${filename}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`calamity-inc ${filename} → ${res.status}`);
  const data = await res.json();
  exportCache.set(filename, { data, ts: now });
  return data;
}

async function getDict() { return loadExport('dict.en.json'); }
function resolve(dict, key) {
  if (!key || !key.startsWith('/Lotus/Language/')) return key;
  return dict[key] ?? key.split('/').pop();
}

// ── DB locale (wf_knowledge) ─────────────────────────────────────────────────

async function queryKnowledge(query, category) {
  const { rows } = await pool.query(
    `SELECT name, data FROM wf_knowledge
     WHERE category = $1
       AND (LOWER(name) LIKE LOWER($2) OR search_vec @@ plainto_tsquery('english', $3))
     ORDER BY LOWER(name) = LOWER($3) DESC, ts_rank(search_vec, plainto_tsquery('english', $3)) DESC
     LIMIT 5`,
    [category, `%${query}%`, query]
  );
  return rows;
}

// ── Fallback live warframestat.us ─────────────────────────────────────────────

async function wfstatSearch(endpoint, query) {
  const res = await fetch(
    `${WFSTAT}/${endpoint}/search/${encodeURIComponent(query)}/?language=en`,
    { headers: HEADERS }
  );
  if (!res.ok) throw new Error(`warframestat.us /${endpoint}/search → ${res.status}`);
  return res.json();
}

// ── searchMod ────────────────────────────────────────────────────────────────

async function searchMod(query) {
  const rows = await queryKnowledge(query, 'mod').catch(() => []);
  if (rows.length) {
    const mod = rows[0].data;
    let out = `**${mod.name}**`;
    if (mod.type)       out += ` _(${mod.type})_`;
    if (mod.rarity)     out += ` · ${mod.rarity}`;
    if (mod.compatName) out += ` · Compatible : ${mod.compatName}`;
    out += '\n';
    if (mod.levelStats?.length) {
      out += '\n**Stats au rang max :**\n';
      const max = mod.levelStats[mod.levelStats.length - 1];
      out += (max.stats ?? []).map(s => `• ${s}`).join('\n');
    }
    if (rows.length > 1) out += `\n\n_${rows.length - 1} autre(s) résultat(s)_`;
    return out;
  }
  // Fallback live
  const results = await wfstatSearch('mods', query);
  if (!results.length) return `Aucun mod trouvé pour "${query}".`;
  const mod = results[0];
  let out = `**${mod.name}**`;
  if (mod.type)       out += ` _(${mod.type})_`;
  if (mod.rarity)     out += ` · ${mod.rarity}`;
  if (mod.compatName) out += ` · Compatible : ${mod.compatName}`;
  out += '\n';
  if (mod.levelStats?.length) {
    out += '\n**Stats au rang max :**\n';
    const max = mod.levelStats[mod.levelStats.length - 1];
    out += (max.stats ?? []).map(s => `• ${s}`).join('\n');
  }
  return out;
}

// ── searchFrame ───────────────────────────────────────────────────────────────

async function searchFrame(query) {
  const rows = await queryKnowledge(query, 'warframe').catch(() => []);
  const f = rows.length ? rows[0].data : (await wfstatSearch('warframes', query))[0];
  if (!f) return `Aucun Warframe trouvé pour "${query}".`;
  let out = `**${f.name}**`;
  if (f.masteryReq) out += ` · MR${f.masteryReq}`;
  out += '\n';
  if (f.description) out += `_${f.description}_\n`;
  out += '\n**Stats de base :**\n';
  if (f.health)      out += `• Santé : ${f.health}\n`;
  if (f.shield)      out += `• Bouclier : ${f.shield}\n`;
  if (f.armor)       out += `• Armure : ${f.armor}\n`;
  if (f.power)       out += `• Énergie : ${f.power}\n`;
  if (f.sprintSpeed) out += `• Sprint : ${f.sprintSpeed}\n`;
  if (f.abilities?.length) {
    out += '\n**Capacités :**\n';
    out += f.abilities.map(a => `• **${a.name}** — ${a.description?.slice(0, 120)}`).join('\n');
  }
  return out;
}

// ── searchWeapon ─────────────────────────────────────────────────────────────

async function searchWeapon(query) {
  const rows = await queryKnowledge(query, 'weapon').catch(() => []);
  const w = rows.length ? rows[0].data : (await wfstatSearch('weapons', query))[0];
  if (!w) return `Aucune arme trouvée pour "${query}".`;
  let out = `**${w.name}**`;
  if (w.productCategory) out += ` _(${w.productCategory})_`;
  if (w.masteryReq)      out += ` · MR${w.masteryReq}`;
  out += '\n';
  if (w.description) out += `_${w.description}_\n`;
  out += '\n**Stats :**\n';
  if (w.totalDamage)        out += `• Dégâts : ${w.totalDamage}\n`;
  if (w.criticalChance)     out += `• Crit : ${Math.round(w.criticalChance * 100)}%\n`;
  if (w.criticalMultiplier) out += `• Multi crit : ${w.criticalMultiplier}x\n`;
  if (w.procChance)         out += `• Status : ${Math.round(w.procChance * 100)}%\n`;
  if (w.fireRate)           out += `• Cadence : ${w.fireRate.toFixed(1)}\n`;
  if (w.magazineSize)       out += `• Chargeur : ${w.magazineSize}\n`;
  return out;
}

// ── searchModsByType — catalogue complet pour les builds ─────────────────────

const TYPE_MAP = {
  rifle: 'Rifle', longguns: 'Rifle', primary: 'Rifle',
  pistol: 'Pistol', secondary: 'Pistol',
  melee: 'Melee',
  shotgun: 'Shotgun',
  sniper: 'Sniper Rifle',
  warframe: 'Warframe',
  sentinel: 'Companion',
};

async function searchModsByType(type) {
  const compatName = TYPE_MAP[type.toLowerCase().replace(/\s+/g, '')] ?? type;

  const { rows } = await pool.query(
    `SELECT name, data FROM wf_knowledge
     WHERE category = 'mod'
       AND (data->>'compatName' = $1 OR data->>'compatName' IS NULL AND $1 = 'Warframe')
     ORDER BY (data->>'baseDrain')::int DESC NULLS LAST
     LIMIT 60`,
    [compatName]
  );

  if (!rows.length) return `Aucun mod trouvé pour le type "${type}".`;

  let out = `**Mods compatibles ${compatName} (rang max) :**\n`;
  for (const row of rows) {
    const mod  = row.data;
    const max  = mod.levelStats?.[mod.levelStats.length - 1]?.stats ?? [];
    const stat = max.join(' / ').slice(0, 120);
    out += `• **${mod.name}** _(${mod.rarity}, ${mod.baseDrain} drain)_ — ${stat}\n`;
  }
  return out;
}

// ── getItemByUniqueName (inventaire, calamity-inc) ───────────────────────────

async function getItemByUniqueName(uniqueName) {
  const files = ['ExportUpgrades.json', 'ExportWarframes.json', 'ExportWeapons.json',
                 'ExportSentinels.json', 'ExportResources.json'];
  const dict = await getDict();
  for (const file of files) {
    const exports = await loadExport(file);
    const item = exports[uniqueName];
    if (item) return { ...item, name: resolve(dict, item.name) };
  }
  return null;
}

module.exports = { searchMod, searchFrame, searchWeapon, searchModsByType, getItemByUniqueName };
