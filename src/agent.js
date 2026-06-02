const { Ollama } = require('ollama');
const api = require('./tools/warframeApi');
const game = require('./tools/gameData');
const { formatBuildResponse } = require('./tools/builds');
const { getInventoryContext } = require('./tools/inventory');

const ollama = new Ollama({ host: process.env.OLLAMA_HOST ?? 'http://localhost:11434' });
const MODEL  = process.env.OLLAMA_MODEL ?? 'qwen2.5:7b';

const SYSTEM_PROMPT = `Tu es un expert Warframe intégré dans un serveur Discord. Tu parles en français par défaut mais tu comprends et acceptes le franglais (Serration/Serration, Steel Path/Route de l'Acier, build/build, etc.).

Tu réponds aussi bien aux débutants (explications claires, pas de jargon inutile) qu'aux vétérans (termes techniques, optimisations min-max).

Pour les données live du jeu (fissures, sortie, baro, etc.), utilise TOUJOURS les outils disponibles plutôt que tes connaissances internes — elles peuvent être obsolètes.

Sois concis et précis. Utilise le formatage Markdown (gras, listes) pour la lisibilité Discord.`;

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'getFissures',
      description: 'Retourne les fissures Void actives (Lith, Meso, Neo, Axi, Requiem) et Steel Path en ce moment.',
    },
  },
  {
    type: 'function',
    function: {
      name: 'getSortie',
      description: 'Retourne la Sortie du jour : missions, boss, et modificateurs actifs.',
    },
  },
  {
    type: 'function',
    function: {
      name: 'getInvasions',
      description: 'Retourne les invasions en cours avec les factions et récompenses.',
    },
  },
  {
    type: 'function',
    function: {
      name: 'getNightwave',
      description: 'Retourne les défis Nightwave actifs : quotidiens, hebdomadaires, élite.',
    },
  },
  {
    type: 'function',
    function: {
      name: 'getBaro',
      description: "Retourne le statut de Baro Ki'Teer : présent ou absent, lieu, horaires, inventaire.",
    },
  },
  {
    type: 'function',
    function: {
      name: 'getSteelPath',
      description: 'Retourne la récompense actuelle du Steel Path Honors et la rotation complète.',
    },
  },
  {
    type: 'function',
    function: {
      name: 'getEvents',
      description: 'Retourne les événements et opérations actuellement actifs.',
    },
  },
  {
    type: 'function',
    function: {
      name: 'searchMod',
      description: 'Recherche un mod Warframe par nom. Retourne ses stats, description et compatibilité.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Nom du mod à rechercher (ex: Serration, Vitality, Primed Continuity)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'searchFrame',
      description: 'Recherche un Warframe par nom. Retourne ses stats de base.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Nom du Warframe (ex: Mesa, Saryn, Revenant)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'searchWeapon',
      description: 'Recherche une arme par nom. Retourne ses stats.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Nom de l\'arme (ex: Braton Prime, Nikana Prime, Kuva Nukor)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getBuildLink',
      description: 'Génère un lien Overframe.gg pour trouver les meilleurs builds communautaires d\'un Warframe ou d\'une arme.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nom exact du Warframe ou de l\'arme' },
        },
        required: ['name'],
      },
    },
  },
];

const TOOL_MAP = {
  getFissures:  () => api.getFissures(),
  getSortie:    () => api.getSortie(),
  getInvasions: () => api.getInvasions(),
  getNightwave: () => api.getNightwave(),
  getBaro:      () => api.getBaro(),
  getSteelPath: () => api.getSteelPath(),
  getEvents:    () => api.getEvents(),
  searchMod:    ({ query }) => game.searchMod(query),
  searchFrame:  ({ query }) => game.searchFrame(query),
  searchWeapon: ({ query }) => game.searchWeapon(query),
  getBuildLink: ({ name }) => formatBuildResponse(name),
};

async function ask(question, userId = null) {
  let systemContent = SYSTEM_PROMPT;

  if (userId) {
    const inv = await getInventoryContext(userId).catch(() => null);
    if (inv) {
      systemContent += '\n\nInventaire de l\'utilisateur :\n' + JSON.stringify(inv, null, 2);
    }
  }

  const messages = [
    { role: 'system', content: systemContent },
    { role: 'user',   content: question },
  ];

  let response = await ollama.chat({ model: MODEL, messages, tools: TOOLS });
  let iterations = 0;

  while (response.message.tool_calls?.length && iterations < 5) {
    messages.push(response.message);

    for (const call of response.message.tool_calls) {
      const fn   = TOOL_MAP[call.function.name];
      const args = call.function.arguments ?? {};
      const result = fn ? await Promise.resolve(fn(args)).catch(e => `Erreur : ${e.message}`) : 'Outil inconnu.';
      messages.push({ role: 'tool', content: String(result) });
    }

    response = await ollama.chat({ model: MODEL, messages, tools: TOOLS });
    iterations++;
  }

  return response.message.content;
}

module.exports = { ask };
