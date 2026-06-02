const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { parseDat, processInventory } = require('../../src/tools/inventory');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('import')
    .setDescription('Importe ton inventaire depuis AlecaFrame (.dat)')
    .addAttachmentOption(o =>
      o.setName('fichier')
        .setDescription('Fichier .dat exporté depuis AlecaFrame')
        .setRequired(true)
    ),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const attachment = interaction.options.getAttachment('fichier');
    if (!attachment.name.endsWith('.dat') && !attachment.name.endsWith('.json')) {
      return interaction.editReply({ content: 'Fichier invalide. Exporte un `.dat` depuis AlecaFrame.' });
    }
    if (attachment.size > 5_000_000) {
      return interaction.editReply({ content: 'Fichier trop volumineux (max 5MB).' });
    }

    const res  = await fetch(attachment.url);
    const buf  = Buffer.from(await res.arrayBuffer());
    const raw  = await parseDat(buf);
    const stat = await processInventory(
      interaction.user.id.toString(),
      interaction.user.username,
      raw
    );

    const embed = new EmbedBuilder()
      .setDescription(`**Inventaire importé !**\n• ${stat.total} items traités\n• ${stat.resolved} noms résolus via les exports Warframe\n\nUtilise \`/inventaire\` pour le voir ou \`/wf\` pour poser des questions dessus.`)
      .setColor(0x2ecc71)
      .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  },
};
