const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { formatBuildResponse } = require('../../src/tools/builds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('build')
    .setDescription('Trouve les meilleurs builds pour un Warframe ou une arme')
    .addStringOption(o => o.setName('nom').setDescription('Nom du Warframe ou de l\'arme').setRequired(true)),
  async execute(interaction) {
    await interaction.deferReply();
    const name = interaction.options.getString('nom');
    const text = formatBuildResponse(name);
    const embed = new EmbedBuilder().setDescription(text).setColor(0x8e44ad).setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  },
};
