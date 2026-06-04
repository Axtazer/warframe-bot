const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.POSTGRES_HOST,
  port:     parseInt(process.env.POSTGRES_PORT ?? '5432'),
  database: process.env.POSTGRES_DB,
  user:     process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
});

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      discord_id  BIGINT PRIMARY KEY,
      username    TEXT NOT NULL,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS inventory_items (
      id           SERIAL PRIMARY KEY,
      discord_id   BIGINT REFERENCES users(discord_id) ON DELETE CASCADE,
      unique_name  TEXT NOT NULL,
      display_name TEXT,
      item_type    TEXT,
      item_count   INTEGER DEFAULT 1,
      item_rank    INTEGER DEFAULT 0,
      imported_at  TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(discord_id, unique_name)
    );

    CREATE TABLE IF NOT EXISTS loadouts (
      id          SERIAL PRIMARY KEY,
      discord_id  BIGINT REFERENCES users(discord_id) ON DELETE CASCADE,
      name        TEXT,
      data        JSONB,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS warframe_builds (
      id          SERIAL PRIMARY KEY,
      item_name   VARCHAR(100) NOT NULL,
      item_type   VARCHAR(20)  NOT NULL,
      build_title VARCHAR(255) NOT NULL,
      mods        JSONB        NOT NULL,
      helminth    VARCHAR(100),
      rating      INT          DEFAULT 0,
      tags        JSONB        DEFAULT '[]'::jsonb,
      scraped_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT unique_item_build UNIQUE (item_name, build_title)
    );
    CREATE INDEX IF NOT EXISTS idx_builds_item_name ON warframe_builds(item_name);
  `);
  console.log('[DB] Tables prêtes.');
}

async function upsertUser(discordId, username) {
  await pool.query(`
    INSERT INTO users (discord_id, username) VALUES ($1, $2)
    ON CONFLICT (discord_id) DO UPDATE SET username = EXCLUDED.username
  `, [discordId, username]);
}

async function upsertInventoryItem(discordId, { uniqueName, displayName, itemType, itemCount, itemRank }) {
  await pool.query(`
    INSERT INTO inventory_items (discord_id, unique_name, display_name, item_type, item_count, item_rank, imported_at)
    VALUES ($1, $2, $3, $4, $5, $6, NOW())
    ON CONFLICT (discord_id, unique_name) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      item_count   = EXCLUDED.item_count,
      item_rank    = EXCLUDED.item_rank,
      imported_at  = NOW()
  `, [discordId, uniqueName, displayName, itemType, itemCount ?? 1, itemRank ?? 0]);
}

async function clearInventory(discordId) {
  await pool.query('DELETE FROM inventory_items WHERE discord_id = $1', [discordId]);
}

async function getUserInventory(discordId) {
  const { rows } = await pool.query(`
    SELECT unique_name, display_name, item_type, item_count, item_rank
    FROM inventory_items WHERE discord_id = $1
    ORDER BY item_type, display_name
  `, [discordId]);
  return rows;
}

async function saveLoadout(discordId, name, data) {
  await pool.query(`
    INSERT INTO loadouts (discord_id, name, data) VALUES ($1, $2, $3)
  `, [discordId, name, JSON.stringify(data)]);
}

module.exports = { init, upsertUser, upsertInventoryItem, clearInventory, getUserInventory, saveLoadout, pool };
