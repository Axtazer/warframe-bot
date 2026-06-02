const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { searchMod } = require('../../src/tools/gameData');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mod')
    .setDescription('Infos sur un mod Warframe')
    .addStringOption(o => o.setName('nom').setDescription('Nom du mod (ex: Serration, Vitality)').setRequired(true)),
  async execute(interaction) {
    await interaction.deferReply();
    const query = interaction.options.getString('nom');
    const text  = await searchMod(query);
    const embed = new EmbedBuilder().setDescription(text).setColor(0xf39c12).setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  },
};
