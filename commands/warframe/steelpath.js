const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getSteelPath } = require('../../src/tools/warframeApi');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('steelpath')
    .setDescription('Récompense actuelle du Steel Path Honors'),
  async execute(interaction) {
    await interaction.deferReply();
    const text = await getSteelPath();
    const embed = new EmbedBuilder().setDescription(text).setColor(0x95a5a6).setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  },
};
