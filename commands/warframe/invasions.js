const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getInvasions } = require('../../src/tools/warframeApi');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('invasions')
    .setDescription('Invasions actives en ce moment'),
  async execute(interaction) {
    await interaction.deferReply();
    const text = await getInvasions();
    const embed = new EmbedBuilder().setDescription(text).setColor(0xe74c3c).setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  },
};
