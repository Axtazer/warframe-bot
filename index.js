const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, GatewayIntentBits, Options } = require('discord.js');
const { Ollama } = require('ollama');
require('dotenv').config();

const db = require('./src/database');

async function ensureModel() {
  const ollama = new Ollama({ host: process.env.OLLAMA_HOST ?? 'http://localhost:11434' });
  const model  = process.env.OLLAMA_MODEL ?? 'warframe-bot';
  console.log(`[MODEL] Création/mise à jour de ${model}...`);
  const stream = await ollama.create({
    model,
    from:       'qwen2.5:7b-instruct-q4_K_S',
    parameters: { num_ctx: 16384, temperature: 0.7, num_predict: 1024 },
    stream:     true,
  });
  for await (const chunk of stream) {
    if (chunk.status && chunk.status !== 'success') process.stdout.write(`[MODEL] ${chunk.status}\r`);
  }
  console.log(`[MODEL] ${model} prêt.`);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  makeCache: Options.cacheWithLimits({
    MessageManager: 0,
    PresenceManager: 0,
    UserManager: 0,
  }),
});

client.commands = new Collection();

const foldersPath = path.join(__dirname, 'commands');
for (const folder of fs.readdirSync(foldersPath)) {
  const commandsPath = path.join(foldersPath, folder);
  for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'))) {
    const command = require(path.join(commandsPath, file));
    if ('data' in command && 'execute' in command) {
      client.commands.set(command.data.name, command);
    } else {
      console.warn(`[WARNING] ${file} manque data ou execute`);
    }
  }
}

const eventsPath = path.join(__dirname, 'events');
for (const file of fs.readdirSync(eventsPath).filter(f => f.endsWith('.js'))) {
  const event = require(path.join(eventsPath, file));
  client[event.once ? 'once' : 'on'](event.name, (...args) => event.execute(...args, client));
}

process.on('unhandledRejection', err => console.error('Unhandled rejection:', err));

ensureModel()
  .then(() => db.init())
  .then(() => client.login(process.env.DISCORD_TOKEN))
  .catch(err => { console.error('Erreur démarrage:', err); process.exit(1); });
