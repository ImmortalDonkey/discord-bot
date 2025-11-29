// interactions/commands/activebounties.cjs
const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { createBountyCard } = require('../../renderers/cardRenderer.cjs');
const { getRankName } = require('../../utils/rankSystem.cjs');
const { getHighestRarityForList, getRarityDisplayLabel } = require('../../utils/rarity.cjs');
const db = require('../../database.cjs');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('activebounties')
    .setDescription('Show all currently active bounties (reposts their cards)'),

  async execute(client, interaction) {
    const active = client.activeBounties;
    if (!active || active.size === 0) {
      return interaction.reply({
        content: '📭 There are currently no active bounties.',
        ephemeral: true
      });
    }

    await interaction.deferReply({ ephemeral: true });

    const channel = interaction.channel;
    const guild = interaction.guild;

    for (const bounty of active.values()) {
      try {
        // Try to reuse existing card if present
        let cardPath = bounty.cardPath;

        if (!cardPath || !fs.existsSync(cardPath)) {
          // Rebuild options + regenerate card
          const member = await guild.members.fetch(bounty.requesterId).catch(() => null);
          const user = member?.user || (await client.users.fetch(bounty.requesterId).catch(() => null));

          const username =
            member?.displayName ||
            user?.username ||
            bounty.requesterName ||
            'Unknown Trainer';

          const avatarUrl =
            user?.displayAvatarURL({ extension: 'png', size: 512 }) ||
            client.user.displayAvatarURL({ extension: 'png', size: 512 });

          const row = await db.getUserById(bounty.requesterId).catch(() => null);
          const lifetime = row?.lifetime_points || 0;
          const rankName = getRankName(lifetime);

          const pokemons = bounty.pokemons || [];
          const rarityKey = getHighestRarityForList(pokemons);
          const rarityLabel = getRarityDisplayLabel(rarityKey);

          const startLabel = bounty.startTime.toLocaleString('en-GB', { hour12: false });
          const endLabel = bounty.endTime.toLocaleString('en-GB', { hour12: false });
          const durationLabel = `${bounty.durationHours} hour(s)`;
          const rewardLabel = `${bounty.reward.toLocaleString()} PKD`;

          const options = {
            bountyId: bounty.id,
            username,
            rankName,
            rarityKey,
            rarityLabel,
            pokemons,
            startLabel,
            endLabel,
            durationLabel,
            note: bounty.notes || '',
            rewardLabel,
            avatarUrl
          };

          cardPath = await createBountyCard(options);
          bounty.cardPath = cardPath;
        }

        await channel.send({
          files: [cardPath]
        });
      } catch (err) {
        console.error('❌ Failed to send active bounty card:', err);
      }
    }

    return interaction.editReply({
      content: '📜 Posted all active bounty cards in this channel.'
    });
  }
};