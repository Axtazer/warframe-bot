const WFSTAT  = 'https://api.warframestat.us';
const CALAMITY = 'https://raw.githubusercontent.com/calamity-inc/warframe-public-export-plus/master';
const HEADERS  = { 'User-Agent': 'WarframeDiscordBot/1.0' };

// Cache calamity-inc (uniqueName lookup pour l'inventaire)
const exportCache = new Map();
const EXPORT_TTL  = 3_600_000;

async function loadExport(filename) {
  const now = Date.now();
  if (exportCache.has(filename) && now - exportCache.get(filename).ts < EXPORT_TTL) {
    return exportCache.get(filename).data;
  }
  const res = await fetch(`${CALAMITY}/${filename}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`calamity-inc ${filename} → ${res.status}`);
  const data = await res.json();
  exportCache.set(filename, { data, ts: now });
  return data;
}

async function getDict() {
  return loadExport('dict.en.json');
}

function resolve(dict, key) {
  if (!key || !key.startsWith('/Lotus/Language/')) return key;
  return dict[key] ?? key.split('/').pop();
}

// Recherche via warframestat.us (noms déjà résolus, données complètes)
async function wfstatSearch(endpoint, query) {
  const res = await fetch(
    `${WFSTAT}/${endpoint}/search/${encodeURIComponent(query)}?language=en`,
    { headers: HEADERS }
  );
  if (!res.ok) throw new Error(`warframestat.us /${endpoint}/search → ${res.status}`);
  return res.json();
}

async function searchMod(query) {
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
  if (results.length > 1) out += `\n\n_${results.length - 1} autre(s) résultat(s)_`;
  return out;
}

async function searchFrame(query) {
  const results = await wfstatSearch('warframes', query);
  if (!results.length) return `Aucun Warframe trouvé pour "${query}".`;

  const f = results[0];
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
  return out;
}

async function searchWeapon(query) {
  const results = await wfstatSearch('weapons', query);
  if (!results.length) return `Aucune arme trouvée pour "${query}".`;

  const w = results[0];
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

// Résolution par uniqueName pour l'inventaire (calamity-inc uniquement)
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

module.exports = { searchMod, searchFrame, searchWeapon, getItemByUniqueName };
