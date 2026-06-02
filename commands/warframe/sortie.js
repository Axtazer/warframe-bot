const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getSortie } = require('../../src/tools/warframeApi');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sortie')
    .setDescription('Sortie du jour'),
  async execute(interaction) {
    await interaction.deferReply();
    const text = await getSortie();
    const embed = new EmbedBuilder().setDescription(text).setColor(0xe67e22).setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  },
};
