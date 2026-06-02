const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { ask } = require('../../src/agent');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('wf')
    .setDescription('Pose une question à l\'IA Warframe')
    .addStringOption(o =>
      o.setName('question')
        .setDescription('Ta question (builds, mods, farming, rotations...)')
        .setRequired(true)
    ),
  async execute(interaction) {
    await interaction.deferReply();
    const question = interaction.options.getString('question');
    const answer   = await ask(question, interaction.user.id.toString());
    const embed = new EmbedBuilder()
      .setDescription(answer.slice(0, 4096))
      .setColor(0x00b4d8)
      .setFooter({ text: 'Warframe AI • Données en temps réel' })
      .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  },
};
