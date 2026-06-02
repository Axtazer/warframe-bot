const { ActivityType } = require('discord.js');

module.exports = {
  name: 'ready',
  once: true,
  execute(client) {
    client.user.setActivity('Warframe', { type: ActivityType.Playing });
    console.log(`[BOT] Connecté en tant que ${client.user.tag}`);
  },
};
