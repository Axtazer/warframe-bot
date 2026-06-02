const BASE = 'https://raw.githubusercontent.com/calamity-inc/warframe-public-export-plus/master';
const HEADERS = { 'User-Agent': 'WarframeDiscordBot/1.0' };

const cache = new Map();
const TTL = 3_600_000; // 1 heure — les exports changent rarement

async function loadExport(filename) {
  const now = Date.now();
  if (cache.has(filename) && now - cache.get(filename).ts < TTL) {
    return cache.get(filename).data;
  }
  const res = await fetch(`${BASE}/${filename}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`browse.wf ${filename} → ${res.status}`);
  const data = await res.json();
  cache.set(filename, { data, ts: now });
  return data;
}

function normalize(str) {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function matchesQuery(name, query) {
  return normalize(name).includes(normalize(query));
}

async function searchMod(query) {
  const exports = await loadExport('ExportUpgrades.json');
  const mods = Object.values(exports).flat().filter(m => m.name && matchesQuery(m.name, query));
  if (!mods.length) return `Aucun mod trouvé pour "${query}".`;

  const mod = mods[0];
  let out = `**${mod.name}**`;
  if (mod.type) out += ` _(${mod.type})_`;
  out += '\n';
  if (mod.description) out += `${mod.description}\n`;
  if (mod.levelStats?.length) {
    out += '\n**Stats au rang max :**\n';
    const max = mod.levelStats[mod.levelStats.length - 1];
    out += (max.stats ?? []).map(s => `• ${s}`).join('\n');
  }
  if (mod.compatName) out += `\nCompatible : ${mod.compatName}`;
  if (mods.length > 1) out += `\n\n_${mods.length - 1} autre(s) résultat(s) pour "${query}"_`;
  return out;
}

async function searchFrame(query) {
  const exports = await loadExport('ExportWarframes.json');
  const frames = Object.values(exports).flat().filter(f => f.name && matchesQuery(f.name, query));
  if (!frames.length) return `Aucun Warframe trouvé pour "${query}".`;

  const frame = frames[0];
  let out = `**${frame.name}**`;
  if (frame.masteryReq) out += ` · MR${frame.masteryReq}`;
  out += '\n';
  if (frame.description) out += `_${frame.description}_\n`;
  out += '\n**Stats de base :**\n';
  if (frame.health)  out += `• Santé : ${frame.health}\n`;
  if (frame.shield)  out += `• Bouclier : ${frame.shield}\n`;
  if (frame.armor)   out += `• Armure : ${frame.armor}\n`;
  if (frame.energy)  out += `• Énergie : ${frame.energy}\n`;
  if (frame.sprintSpeed) out += `• Sprint : ${frame.sprintSpeed}\n`;
  return out;
}

async function searchWeapon(query) {
  const exports = await loadExport('ExportWeapons.json');
  const weapons = Object.values(exports).flat().filter(w => w.name && matchesQuery(w.name, query));
  if (!weapons.length) return `Aucune arme trouvée pour "${query}".`;

  const w = weapons[0];
  let out = `**${w.name}**`;
  if (w.type) out += ` _(${w.type})_`;
  if (w.masteryReq) out += ` · MR${w.masteryReq}`;
  out += '\n';
  if (w.description) out += `_${w.description}_\n`;
  out += '\n**Stats :**\n';
  if (w.damage)        out += `• Dégâts : ${w.damage}\n`;
  if (w.criticalChance) out += `• Crit chance : ${Math.round(w.criticalChance * 100)}%\n`;
  if (w.criticalMultiplier) out += `• Crit multiplier : ${w.criticalMultiplier}x\n`;
  if (w.procChance)    out += `• Status : ${Math.round(w.procChance * 100)}%\n`;
  if (w.fireRate)      out += `• Cadence : ${w.fireRate}\n`;
  return out;
}

async function getItemByUniqueName(uniqueName) {
  const files = ['ExportUpgrades.json', 'ExportWarframes.json', 'ExportWeapons.json', 'ExportResources.json'];
  for (const file of files) {
    const exports = await loadExport(file);
    const items = Object.values(exports).flat();
    const found = items.find(i => i.uniqueName === uniqueName);
    if (found) return found;
  }
  return null;
}

module.exports = { searchMod, searchFrame, searchWeapon, getItemByUniqueName };
