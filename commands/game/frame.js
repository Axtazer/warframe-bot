const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { searchFrame } = require('../../src/tools/gameData');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('frame')
    .setDescription('Stats d\'un Warframe')
    .addStringOption(o => o.setName('nom').setDescription('Nom du Warframe (ex: Mesa, Saryn)').setRequired(true)),
  async execute(interaction) {
    await interaction.deferReply();
    const query = interaction.options.getString('nom');
    const text  = await searchFrame(query);
    const embed = new EmbedBuilder().setDescription(text).setColor(0x1abc9c).setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  },
};
