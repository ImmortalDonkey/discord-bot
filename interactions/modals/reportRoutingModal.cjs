// interactions/modals/reportRoutingModal.cjs

const db = require('../../database.cjs');

const RARITY_KEYS = [
  'paradox',
  'roamer_month',
  'legendary',
  'rare',
  'common'
];

module.exports = {
  // Required by modalHandler.cjs
  ids: ['reportrouting_modal'],

  async execute(client, interaction) {
    const { guild } = interaction;

    if (!guild) {
      return interaction.reply({
        content: '❌ Invalid guild context.',
        flags: 64
      });
    }

    // ──────────────────────────────
    // PHASE 1: VALIDATION (NO WRITES)
    // ──────────────────────────────
    const planned = [];

    for (const key of RARITY_KEYS) {
      const value = interaction.fields
        .getTextInputValue(`channel_${key}`)
        ?.trim();

      // Blank = remove override
      if (!value) {
        planned.push({ key, channelId: null });
        continue;
      }

      if (!/^\d{17,20}$/.test(value)) {
        return interaction.reply({
          content: `❌ Invalid channel ID for **${key}**.`,
          flags: 64
        });
      }

      const channel = await guild.channels.fetch(value).catch(() => null);
      if (!channel) {
        return interaction.reply({
          content: `❌ Channel not found for **${key}**.`,
          flags: 64
        });
      }

      planned.push({ key, channelId: value });
    }

    // ──────────────────────────────
    // PHASE 2: APPLY CHANGES
    // ──────────────────────────────
    const updates = [];

    for (const entry of planned) {
      if (!entry.channelId) {
        await db.removeGuildRarityChannel(guild.id, entry.key);
        continue;
      }

      await db.upsertGuildRarityChannel({
        guildId: guild.id,
        rarityKey: entry.key,
        channelId: entry.channelId
      });

      updates.push(`${entry.key} → <#${entry.channelId}>`);
    }

    return interaction.reply({
      content: updates.length
        ? `✔ Report routing updated:\n${updates.join('\n')}`
        : '✔ Routing cleared. Default channel will be used for all reports.',
      flags: 64
    });
  }
};
