const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getBaro } = require('../../src/tools/warframeApi');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('baro')
    .setDescription("Statut de Baro Ki'Teer"),
  async execute(interaction) {
    await interaction.deferReply();
    const text = await getBaro();
    const embed = new EmbedBuilder().setDescription(text).setColor(0xf1c40f).setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  },
};
