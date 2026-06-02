const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (err) {
      console.error(`[CMD] Erreur sur /${interaction.commandName}:`, err);
      const embed = new EmbedBuilder()
        .setDescription('Une erreur est survenue lors de l\'exécution de la commande.')
        .setColor(0xe74c3c);
      const reply = { embeds: [embed], ephemeral: true };
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(reply);
      } else {
        await interaction.reply(reply);
      }
    }
  },
};
