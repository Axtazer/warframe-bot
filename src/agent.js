const { Ollama } = require('ollama');
const api = require('./tools/warframeApi');
const game = require('./tools/gameData');
const { getInventoryContext } = require('./tools/inventory');
const { searchDrops } = require('./tools/drops');
const { searchWiki } = require('./tools/wiki');
const { searchBuilds } = require('./tools/overframe');

const ollama = new Ollama({ host: process.env.OLLAMA_HOST ?? 'http://localhost:11434' });
const MODEL  = process.env.OLLAMA_MODEL ?? 'warframe-bot';

const BASE_SYSTEM_PROMPT = `Tu es l'assistant IA Warframe de ce serveur Discord. Réponds en français, formatté pour Discord (Markdown : gras, listes, \`code\`).
Tu maîtrises le modding (Primed, Galvanized, Corrupted), les dégâts IPS (Tranchant/Viral/Corrosif), le Helminth et le Steel Path.

RÈGLES STRICTES sur les sources :
- Pour le lore, les mécaniques, les capacités : utilise searchWiki. Base-toi UNIQUEMENT sur ce qu'il retourne. N'invente JAMAIS de détails absents des résultats.
- Si searchWiki ne retourne pas d'info précise, dis-le plutôt que de compléter avec ta mémoire.
- Pour les données live (fissures, Baro, Sortie, Nightwave) : utilise TOUJOURS les outils.
- Pour farmer : searchDrops. Pour les builds : searchBuilds.

STYLE DE RÉPONSE selon le type de question :

LORE / HISTOIRE : Réponds de façon concise — un résumé clair et compréhensible, pas un dump de wiki. 3-5 phrases max sauf si l'utilisateur demande explicitement plus de détails ("explique en détail", "raconte tout", "approfondi").

BUILDS : Réponds de façon complète et pédagogique. Pour chaque mod explique :
  • Son rôle individuel dans le build
  • Pourquoi il est combiné avec les autres (synergies, conditions déclenchées)
  • Sa place dans la rotation de dégâts/survie
  Inclus toujours les Arcanes recommandées et leur interaction avec le build.`;

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
      name: 'searchBuilds',
      description: 'Récupère les builds meta communautaires Overframe.gg pour un Warframe ou une arme : mods les plus utilisés, top builds notés, substituts Helminth. À utiliser dès qu\'on parle de build, modding ou theorycraft.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Nom du Warframe ou de l\'arme (ex: Saryn, Saryn Prime, Kuva Nukor, Nikana Prime)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'searchDrops',
      description: 'Recherche où farmer un item (blueprint, composant, mod). Retourne les sources de drop avec les taux.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Nom de l\'item à farmer (ex: Ash Prime Neuroptics, Primed Flow, Gauss Blueprint)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'searchWiki',
      description: 'Recherche des informations sur le wiki Warframe (mécaniques, capacités, ennemis, lore).',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Sujet à rechercher (ex: Slash proc, Arbitrations, Kuva Lich, Galvanized mods)' },
        },
        required: ['query'],
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
  searchBuilds:  ({ query }) => searchBuilds(query),
  searchDrops:   ({ query }) => searchDrops(query),
  searchWiki:    ({ query }) => searchWiki(query),
};

async function ask(question, userId = null) {
  let systemContent = BASE_SYSTEM_PROMPT;

  if (userId) {
    const inv = await getInventoryContext(userId).catch(() => null);
    if (inv) {
      systemContent += '\n\n[INVENTAIRE DU JOUEUR (AlecaFrame)]:\n' + JSON.stringify(inv);
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
