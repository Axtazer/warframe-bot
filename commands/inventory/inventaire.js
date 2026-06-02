const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getInventorySummary } = require('../../src/tools/inventory');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('inventaire')
    .setDescription('Affiche ton inventaire Warframe importé'),
  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const text = await getInventorySummary(interaction.user.id.toString());
    const embed = new EmbedBuilder()
      .setDescription(text.slice(0, 4096))
      .setColor(0x3498db)
      .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  },
};
