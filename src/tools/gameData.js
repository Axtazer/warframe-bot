const BASE = 'https://raw.githubusercontent.com/calamity-inc/warframe-public-export-plus/master';
const HEADERS = { 'User-Agent': 'WarframeDiscordBot/1.0' };

const cache = new Map();
const TTL = 3_600_000;

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

async function getDict() {
  return loadExport('dict.en.json');
}

function resolve(dict, key) {
  if (!key || !key.startsWith('/Lotus/Language/')) return key;
  return dict[key] ?? key.split('/').pop();
}

function normalize(str) {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function searchMod(query) {
  const [exports, dict] = await Promise.all([loadExport('ExportUpgrades.json'), getDict()]);
  const entries = Object.entries(exports);
  const matches = entries.filter(([, m]) => matchesQuery(resolve(dict, m.name), query));
  if (!matches.length) return `Aucun mod trouvé pour "${query}".`;

  const [uniqueName, mod] = matches[0];
  const name = resolve(dict, mod.name);
  let out = `**${name}**`;
  if (mod.type) out += ` _(${mod.type})_`;
  out += '\n';
  if (mod.description) out += `${resolve(dict, mod.description)}\n`;
  if (mod.levelStats?.length) {
    out += '\n**Stats au rang max :**\n';
    const max = mod.levelStats[mod.levelStats.length - 1];
    out += (max.stats ?? []).map(s => `• ${resolve(dict, s)}`).join('\n');
  }
  if (mod.compatName) out += `\nCompatible : ${resolve(dict, mod.compatName)}`;
  if (matches.length > 1) out += `\n\n_${matches.length - 1} autre(s) résultat(s)_`;
  return out;
}

async function searchFrame(query) {
  const [exports, dict] = await Promise.all([loadExport('ExportWarframes.json'), getDict()]);
  const entries = Object.entries(exports);
  const matches = entries.filter(([, f]) => matchesQuery(resolve(dict, f.name), query));
  if (!matches.length) return `Aucun Warframe trouvé pour "${query}".`;

  const [, frame] = matches[0];
  const name = resolve(dict, frame.name);
  let out = `**${name}**`;
  if (frame.masteryReq) out += ` · MR${frame.masteryReq}`;
  out += '\n';
  if (frame.description) out += `_${resolve(dict, frame.description)}_\n`;
  out += '\n**Stats de base :**\n';
  if (frame.health)      out += `• Santé : ${frame.health}\n`;
  if (frame.shield)      out += `• Bouclier : ${frame.shield}\n`;
  if (frame.armor)       out += `• Armure : ${frame.armor}\n`;
  if (frame.energy)      out += `• Énergie : ${frame.energy}\n`;
  if (frame.sprintSpeed) out += `• Sprint : ${frame.sprintSpeed}\n`;
  return out;
}

async function searchWeapon(query) {
  const [exports, dict] = await Promise.all([loadExport('ExportWeapons.json'), getDict()]);
  const entries = Object.entries(exports);
  const matches = entries.filter(([, w]) => matchesQuery(resolve(dict, w.name), query));
  if (!matches.length) return `Aucune arme trouvée pour "${query}".`;

  const [, w] = matches[0];
  const name = resolve(dict, w.name);
  let out = `**${name}**`;
  if (w.productCategory) out += ` _(${w.productCategory})_`;
  if (w.masteryReq) out += ` · MR${w.masteryReq}`;
  out += '\n';
  if (w.description) out += `_${resolve(dict, w.description)}_\n`;
  out += '\n**Stats :**\n';
  if (w.totalDamage)         out += `• Dégâts : ${w.totalDamage}\n`;
  if (w.criticalChance)      out += `• Crit chance : ${Math.round(w.criticalChance * 100)}%\n`;
  if (w.criticalMultiplier)  out += `• Crit multiplier : ${w.criticalMultiplier}x\n`;
  if (w.procChance)          out += `• Status : ${Math.round(w.procChance * 100)}%\n`;
  if (w.fireRate)            out += `• Cadence : ${w.fireRate}\n`;
  return out;
}

async function getItemByUniqueName(uniqueName) {
  const files = ['ExportUpgrades.json', 'ExportWarframes.json', 'ExportWeapons.json',
                 'ExportWeapons.json', 'ExportSentinels.json', 'ExportResources.json'];
  const dict = await getDict();
  for (const file of files) {
    const exports = await loadExport(file);
    const item = exports[uniqueName];
    if (item) {
      return { ...item, name: resolve(dict, item.name) };
    }
  }
  return null;
}

function matchesQuery(name, query) {
  if (!name) return false;
  return normalize(name).includes(normalize(query));
}

module.exports = { searchMod, searchFrame, searchWeapon, getItemByUniqueName };
