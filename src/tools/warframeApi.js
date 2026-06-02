const BASE = 'https://api.warframestat.us/pc';
const HEADERS = { 'User-Agent': 'WarframeDiscordBot/1.0' };

const cache = new Map();
const TTL = 60_000; // 1 minute

async function get(endpoint) {
  const now = Date.now();
  if (cache.has(endpoint) && now - cache.get(endpoint).ts < TTL) {
    return cache.get(endpoint).data;
  }
  const res = await fetch(`${BASE}${endpoint}?language=en`, { headers: HEADERS });
  if (!res.ok) throw new Error(`warframestat.us ${endpoint} → ${res.status}`);
  const data = await res.json();
  cache.set(endpoint, { data, ts: now });
  return data;
}

function formatReward(reward) {
  const items = reward?.countedItems ?? [];
  if (items.length) return items.map(i => `${i.count}x ${i.type}`).join(', ');
  if (reward?.credits) return `${reward.credits.toLocaleString()} crédits`;
  return 'aucune récompense';
}

async function getFissures() {
  const data = await get('/fissures');
  const tiers = ['Lith', 'Meso', 'Neo', 'Axi', 'Requiem'];
  const normal = data.filter(f => !f.isStorm && !f.isHard);
  const steel  = data.filter(f => f.isHard);

  let out = '**Fissures Void actives**\n';
  for (const tier of tiers) {
    const list = normal.filter(f => f.tier === tier);
    if (!list.length) continue;
    out += list.map(f => `• **${tier}** — ${f.missionType} · ${f.node} (${f.enemy}) · expire <t:${Math.floor(new Date(f.expiry).getTime()/1000)}:R>`).join('\n') + '\n';
  }
  if (steel.length) {
    out += '\n**Steel Path**\n';
    out += steel.slice(0, 5).map(f => `• **${f.tier}** — ${f.missionType} · ${f.node}`).join('\n');
  }
  return out;
}

async function getSortie() {
  const d = await get('/sortie');
  const boss = d.boss ?? '?';
  let out = `**Sortie du jour — ${boss}**\n`;
  for (const [i, v] of (d.variants ?? []).entries()) {
    out += `\`${i+1}.\` ${v.node} — **${v.missionType}**\n`;
    out += `    Modifier : ${v.modifier}\n`;
    out += `    _${v.modifierDescription}_\n`;
  }
  out += `\nExpire <t:${Math.floor(new Date(d.expiry).getTime()/1000)}:R>`;
  return out;
}

async function getInvasions() {
  const data = await get('/invasions');
  const active = data.filter(i => !i.completed).slice(0, 8);
  if (!active.length) return 'Aucune invasion active.';
  let out = '**Invasions actives**\n';
  for (const inv of active) {
    const pct = Math.round((inv.completion ?? 0) * 100) / 100;
    out += `• **${inv.node}** — ${inv.attacker.faction} vs ${inv.defender.faction}\n`;
    out += `  ↳ ${formatReward(inv.attacker.reward)} | ${formatReward(inv.defender.reward)} · ${pct}%\n`;
  }
  return out;
}

async function getNightwave() {
  const d = await get('/nightwave');
  const challenges = d.activeChallenges ?? [];
  const daily   = challenges.filter(c => c.isDaily && !c.isPermanent);
  const weekly  = challenges.filter(c => !c.isDaily && !c.isElite && !c.isPermanent);
  const elite   = challenges.filter(c => c.isElite);

  let out = `**Nightwave — Saison ${d.season}**\n`;
  if (daily.length) {
    out += '\n**Quotidiens**\n';
    out += daily.map(c => `• **${c.title}** — ${c.desc} _(${c.reputation.toLocaleString()} rep)_`).join('\n') + '\n';
  }
  if (weekly.length) {
    out += '\n**Hebdomadaires**\n';
    out += weekly.map(c => `• **${c.title}** — ${c.desc} _(${c.reputation.toLocaleString()} rep)_`).join('\n') + '\n';
  }
  if (elite.length) {
    out += '\n**Élite**\n';
    out += elite.map(c => `• **${c.title}** — ${c.desc} _(${c.reputation.toLocaleString()} rep)_`).join('\n') + '\n';
  }
  return out;
}

async function getBaro() {
  const d = await get('/voidTrader');
  const now        = Date.now();
  const activation = new Date(d.activation).getTime();
  const expiry     = new Date(d.expiry).getTime();

  if (now < activation) {
    return `**Baro Ki'Teer** n'est pas encore là.\nLieu : ${d.location}\nArrivée <t:${Math.floor(activation/1000)}:R>`;
  }
  if (now < expiry) {
    const inv = d.inventory ?? [];
    let out = `**Baro Ki'Teer est là !** (${d.location})\nPart <t:${Math.floor(expiry/1000)}:R>\n`;
    if (inv.length) {
      out += '\n**Inventaire**\n';
      out += inv.map(i => `• ${i.item} — ${i.ducats} Ducats + ${i.credits.toLocaleString()} crédits`).join('\n');
    } else {
      out += '_Inventaire non disponible_';
    }
    return out;
  }
  return `**Baro Ki'Teer** est reparti. Prochain passage <t:${Math.floor(activation/1000)}:R>.`;
}

async function getSteelPath() {
  const d = await get('/steelPath');
  const r = d.currentReward ?? {};
  let out = `**Steel Path — Récompense actuelle**\n• ${r.name} _(${r.cost} Accolades)_\nExpire dans : ${d.remaining}\n`;
  if (d.rotation?.length) {
    out += '\n**Rotation complète**\n';
    out += d.rotation.map(i => `• ${i.name} _(${i.cost} Accolades)_`).join('\n');
  }
  return out;
}

async function getEvents() {
  const data = await get('/events');
  if (!data?.length) return 'Aucun événement actif.';
  let out = '**Événements actifs**\n';
  for (const e of data) {
    out += `\n**${e.description}**\n`;
    if (e.tooltip) out += `${e.tooltip.slice(0, 300)}\n`;
    out += `Nœud : ${e.node} · Expire <t:${Math.floor(new Date(e.expiry).getTime()/1000)}:R>\n`;
  }
  return out;
}

module.exports = { getFissures, getSortie, getInvasions, getNightwave, getBaro, getSteelPath, getEvents };
