const db = require('../../database.cjs');

const RARITY_KEYS = [
  'paradox',
  'roamer_month',
  'legendary',
  'rare',
  'common'
];

module.exports = {
  customId: 'reportrouting_modal',

  async execute(client, interaction) {
    const { guild } = interaction;

    if (!guild) {
      return interaction.reply({
        content: '❌ Invalid guild context.',
        flags: 64
      });
    }

    const updates = [];

    for (const key of RARITY_KEYS) {
      const value = interaction.fields.getTextInputValue(`channel_${key}`)?.trim();

      if (!value) {
        // Blank = remove override
        await db.removeGuildRarityChannel(guild.id, key);
        continue;
      }

      if (!/^\d{17,20}$/.test(value)) {
        return interaction.reply({
          content: `❌ Invalid channel ID for **${key}**.`,
          flags: 64
        });
      }

      // Optional: validate channel exists
      const channel = await guild.channels.fetch(value).catch(() => null);
      if (!channel) {
        return interaction.reply({
          content: `❌ Channel not found for **${key}**.`,
          flags: 64
        });
      }

      await db.upsertGuildRarityChannel({
        guildId: guild.id,
        rarityKey: key,
        channelId: value
      });

      updates.push(`${key} → <#${value}>`);
    }

    return interaction.reply({
      content: updates.length
        ? `✔ Report routing updated:\n${updates.join('\n')}`
        : '✔ Routing cleared. Default channel will be used for all reports.',
      flags: 64
    });
  }
};
