const { pool, upsertUser } = require('../database');
const { getItemByUniqueName } = require('./gameData');

const AES_KEY = Buffer.from('LEO-ALEC\tEO-ALEC', 'binary');
const AES_IV  = Buffer.from([49, 50, 70, 71, 66, 51, 54, 45, 76, 69, 51, 45, 113, 61, 57, 0]);

async function parseDat(buffer) {
  try {
    const { createDecipheriv } = require('crypto');
    const decipher = createDecipheriv('aes-128-cbc', AES_KEY, AES_IV);
    const decrypted = Buffer.concat([decipher.update(buffer), decipher.final()]);
    let data = JSON.parse(decrypted.toString('utf8'));
    if (data.InventoryJson) data = JSON.parse(data.InventoryJson);
    return data;
  } catch {}

  try { return JSON.parse(buffer.toString('utf8')); } catch {}

  throw new Error('Format non reconnu — utilise le fichier lastData.dat d\'AlecaFrame ou warframe-api-helper.');
}

function extractItems(raw) {
  const inv = raw?.Inventory ?? raw;
  const map = new Map();

  function add(uniqueName, itemType, itemCount, itemRank) {
    if (map.has(uniqueName)) {
      const e = map.get(uniqueName);
      e.itemCount += itemCount;
      e.itemRank = Math.max(e.itemRank, itemRank);
    } else {
      map.set(uniqueName, { uniqueName, itemType, itemCount, itemRank });
    }
  }

  for (const mod of inv?.Upgrades ?? []) {
    if (!mod.ItemType) continue;
    const rank = mod.UpgradeFingerprint ? (JSON.parse(mod.UpgradeFingerprint)?.lvl ?? 0) : 0;
    add(mod.ItemType, 'Mod', mod.ItemCount ?? 1, rank);
  }
  for (const frame of inv?.Suits     ?? []) { if (frame.ItemType) add(frame.ItemType, 'Warframe',  1, 0); }
  for (const w     of inv?.LongGuns  ?? []) { if (w.ItemType)     add(w.ItemType,     'Primary',   1, 0); }
  for (const w     of inv?.Pistols   ?? []) { if (w.ItemType)     add(w.ItemType,     'Secondary', 1, 0); }
  for (const w     of inv?.Melee     ?? []) { if (w.ItemType)     add(w.ItemType,     'Melee',     1, 0); }

  return [...map.values()];
}

async function processInventory(discordId, username, raw) {
  const items = extractItems(raw);
  if (!items.length) throw new Error('Aucun item trouvé dans le fichier.');

  // Résolution des noms avant la transaction (séquentiel pour éviter 100+ requêtes simultanées)
  let resolved = 0;
  const resolved_items = [];
  for (const item of items) {
    const gameItem = await getItemByUniqueName(item.uniqueName);
    if (gameItem) resolved++;
    resolved_items.push({ ...item, displayName: gameItem?.name ?? item.uniqueName.split('/').pop() });
  }

  await upsertUser(discordId, username);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query('DELETE FROM inventory_items WHERE discord_id = $1', [discordId]);

    for (const item of resolved_items) {
      await client.query(
        `INSERT INTO inventory_items (discord_id, unique_name, display_name, item_type, item_count, item_rank)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [discordId, item.uniqueName, item.displayName, item.itemType, item.itemCount ?? 1, item.itemRank ?? 0]
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[INVENTORY] Rollback exécuté :', err);
    throw err;
  } finally {
    client.release();
  }

  return { total: items.length, resolved };
}

async function getInventorySummary(discordId) {
  const { rows } = await pool.query(
    'SELECT unique_name, display_name, item_type, item_count, item_rank FROM inventory_items WHERE discord_id = $1 ORDER BY item_type, display_name',
    [discordId]
  );
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
      const rank  = i.item_rank  > 0 ? ` R${i.item_rank}`  : '';
      const count = i.item_count > 1 ? ` x${i.item_count}` : '';
      return `• ${i.display_name}${rank}${count}`;
    }).join('\n');
    if (list.length > 10) out += `\n_... et ${list.length - 10} autres_`;
    out += '\n';
  }
  return out;
}

async function getInventoryContext(discordId) {
  const { rows } = await pool.query(
    'SELECT display_name, item_type, item_rank FROM inventory_items WHERE discord_id = $1 ORDER BY item_type, display_name',
    [discordId]
  );
  if (!rows.length) return null;

  const grouped = {};
  for (const row of rows) {
    if (!grouped[row.item_type]) grouped[row.item_type] = [];
    grouped[row.item_type].push(`${row.display_name}${row.item_rank > 0 ? ` R${row.item_rank}` : ''}`);
  }
  return grouped;
}

module.exports = { parseDat, processInventory, getInventorySummary, getInventoryContext };
