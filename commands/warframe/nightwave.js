const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getNightwave } = require('../../src/tools/warframeApi');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('nightwave')
    .setDescription('Défis Nightwave actifs'),
  async execute(interaction) {
    await interaction.deferReply();
    const text = await getNightwave();
    const embed = new EmbedBuilder().setDescription(text).setColor(0x2ecc71).setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  },
};
