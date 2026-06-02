const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getEvents } = require('../../src/tools/warframeApi');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('events')
    .setDescription('Événements et opérations actifs'),
  async execute(interaction) {
    await interaction.deferReply();
    const text = await getEvents();
    const embed = new EmbedBuilder().setDescription(text).setColor(0x3498db).setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  },
};
