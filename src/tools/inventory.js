const db = require('../database');
const { getItemByUniqueName } = require('./gameData');

async function parseDat(buffer) {
  const preview = buffer.slice(0, 100).toString('utf8');
  const hex     = buffer.slice(0, 16).toString('hex');
  console.log('[import] taille:', buffer.length, '| hex début:', hex, '| texte début:', JSON.stringify(preview));

  // Essai 1 : JSON brut
  try { return JSON.parse(buffer.toString('utf8')); } catch {}

  // Essai 2 : base64 → JSON
  try { return JSON.parse(Buffer.from(buffer.toString('utf8').trim(), 'base64').toString('utf8')); } catch {}

  // Essai 3 : gzip → JSON
  try {
    const { gunzipSync } = require('zlib');
    return JSON.parse(gunzipSync(buffer).toString('utf8'));
  } catch {}

  // Essai 4 : zlib inflate raw
  try {
    const { inflateRawSync } = require('zlib');
    return JSON.parse(inflateRawSync(buffer).toString('utf8'));
  } catch {}

  // Essai 5 : brotli
  try {
    const { brotliDecompressSync } = require('zlib');
    return JSON.parse(brotliDecompressSync(buffer).toString('utf8'));
  } catch {}

  // Log pour debug
  console.log('[import] magic bytes:', buffer.slice(0, 8).toString('hex'));
  throw new Error('Format non reconnu — exporte depuis AlecaFrame en JSON ou .dat.');
}

function extractItems(raw) {
  const items = [];
  const inv = raw?.Inventory ?? raw;

  // Mods
  for (const mod of inv?.Upgrades ?? []) {
    if (!mod.ItemType) continue;
    items.push({
      uniqueName: mod.ItemType,
      itemType:   'Mod',
      itemCount:  mod.ItemCount ?? 1,
      itemRank:   mod.UpgradeFingerprint ? (JSON.parse(mod.UpgradeFingerprint)?.lvl ?? 0) : 0,
    });
  }

  // Warframes
  for (const frame of inv?.Suits ?? []) {
    if (!frame.ItemType) continue;
    items.push({ uniqueName: frame.ItemType, itemType: 'Warframe', itemCount: 1, itemRank: 0 });
  }

  // Armes primaires
  for (const w of inv?.LongGuns ?? []) {
    if (!w.ItemType) continue;
    items.push({ uniqueName: w.ItemType, itemType: 'Primary', itemCount: 1, itemRank: 0 });
  }

  // Armes secondaires
  for (const w of inv?.Pistols ?? []) {
    if (!w.ItemType) continue;
    items.push({ uniqueName: w.ItemType, itemType: 'Secondary', itemCount: 1, itemRank: 0 });
  }

  // Mêlée
  for (const w of inv?.Melee ?? []) {
    if (!w.ItemType) continue;
    items.push({ uniqueName: w.ItemType, itemType: 'Melee', itemCount: 1, itemRank: 0 });
  }

  return items;
}

async function processInventory(discordId, username, raw) {
  const items = extractItems(raw);
  if (!items.length) throw new Error('Aucun item trouvé dans le fichier.');

  await db.upsertUser(discordId, username);
  await db.clearInventory(discordId);

  let resolved = 0;
  for (const item of items) {
    const gameItem = await getItemByUniqueName(item.uniqueName);
    await db.upsertInventoryItem(discordId, {
      ...item,
      displayName: gameItem?.name ?? item.uniqueName.split('/').pop(),
    });
    if (gameItem) resolved++;
  }

  return { total: items.length, resolved };
}

async function getInventorySummary(discordId) {
  const rows = await db.getUserInventory(discordId);
  if (!rows.length) return 'Aucun inventaire importé. Utilise `/import` pour charger ton fichier AlecaFrame.';

  const grouped = {};
  for (const row of rows) {
    const type = row.item_type ?? 'Autre';
    if (!grouped[type]) grouped[type] = [];
    grouped[type].push(row);
  }

  let out = `**Ton inventaire Warframe** _(${rows.length} items)_\n`;
  for (const [type, list] of Object.entries(grouped)) {
    out += `\n**${type}** (${list.length})\n`;
    out += list.slice(0, 10).map(i => {
      const rank = i.item_rank > 0 ? ` R${i.item_rank}` : '';
      const count = i.item_count > 1 ? ` x${i.item_count}` : '';
      return `• ${i.display_name}${rank}${count}`;
    }).join('\n');
    if (list.length > 10) out += `\n_... et ${list.length - 10} autres_`;
    out += '\n';
  }
  return out;
}

async function getInventoryContext(discordId) {
  const rows = await db.getUserInventory(discordId);
  if (!rows.length) return null;

  const grouped = {};
  for (const row of rows) {
    if (!grouped[row.item_type]) grouped[row.item_type] = [];
    grouped[row.item_type].push(`${row.display_name}${row.item_rank > 0 ? ` R${row.item_rank}` : ''}`);
  }
  return grouped;
}

module.exports = { parseDat, processInventory, getInventorySummary, getInventoryContext };
