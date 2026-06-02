const { EmbedBuilder } = require('discord.js');
const { ask } = require('../src/agent');

module.exports = {
  name: 'messageCreate',
  async execute(message, client) {
    if (message.author.bot) return;
    if (!message.mentions.has(client.user)) return;

    const question = message.content.replace(/<@!?\d+>/g, '').trim();
    if (!question) return;

    const typing = message.channel.sendTyping();
    try {
      const answer = await ask(question, message.author.id.toString());
      const embed = new EmbedBuilder()
        .setDescription(answer.slice(0, 4096))
        .setColor(0x00b4d8)
        .setFooter({ text: 'Warframe AI • Données en temps réel' });
      await message.reply({ embeds: [embed] });
    } catch (err) {
      console.error('[MENTION]', err);
      await message.reply('Erreur lors de la requête à l\'IA.');
    }
  },
};
