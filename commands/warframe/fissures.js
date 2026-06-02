const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getFissures } = require('../../src/tools/warframeApi');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('fissures')
    .setDescription('Fissures Void actives en ce moment'),
  async execute(interaction) {
    await interaction.deferReply();
    const text = await getFissures();
    const embed = new EmbedBuilder().setDescription(text).setColor(0x9b59b6).setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  },
};
