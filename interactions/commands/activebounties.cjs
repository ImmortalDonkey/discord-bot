// interactions/commands/activebounties.cjs
const {
  SlashCommandBuilder
} = require('discord.js');

const { createBountyCard } = require('../../renderers/cardRenderer.cjs');
const db = require('../../database.cjs');
const { getRankName } = require('../../utils/rankSystem.cjs');
const {
  getHighestRarityForList,
  getRarityDisplayLabel
} = require('../../utils/rarity.cjs');

function formatTimeLabel(date) {
  if (!(date instanceof Date)) return 'Unknown';
  return `<t:${Math.floor(date.getTime() / 1000)}:F>`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('activebounties')
    .setDescription('View all currently active bounties'),

  async execute(client, interaction) {
    if (!client.activeBounties || client.activeBounties.size === 0) {
      return interaction.reply({
        content: 'ℹ There are currently no active bounties.',
        ephemeral: true
      });
    }

    await interaction.reply({
      content: '📋 Posting all active bounties...',
      ephemeral: true
    });

    const bountyChannelId = process.env.BOUNTY_CHANNEL_ID || interaction.channel.id;
    const bountyChannel = bountyChannelId
      ? interaction.guild.channels.cache.get(bountyChannelId)
        || await interaction.guild.channels.fetch(bountyChannelId).catch(() => null)
      : interaction.channel;

    if (!bountyChannel) {
      return interaction.followUp({
        content: '❌ Could not find bounty channel.',
        ephemeral: true
      });
    }

    for (const bounty of client.activeBounties.values()) {
      try {
        const rarityKey = getHighestRarityForList(bounty.pokemons);
        const rarityLabel = getRarityDisplayLabel(rarityKey);

        let displayName = bounty.requesterName;
        let avatarUrl = interaction.client.user.displayAvatarURL({
          extension: 'png',
          size: 512
        });
        let rankName = 'Rookie Trainer';

        try {
          const member = await interaction.guild.members.fetch(bounty.requesterId);
          displayName = member.displayName || member.user.username;
          avatarUrl = member.displayAvatarURL({ extension: 'png', size: 512 });

          const row = await db.getUserById(bounty.requesterId);
          const lifetime = row?.lifetime_points || 0;
          rankName = getRankName(lifetime);
        } catch {
          // ignore
        }

        const rewardLabel = `${bounty.reward.toLocaleString()} PKD`;
        const startLabel = formatTimeLabel(bounty.startTime);
        const endLabel = formatTimeLabel(bounty.endTime);
        const durationLabel = `${bounty.durationHours} hour(s)`;

        const buffer = await createBountyCard({
          bountyId: bounty.id,
          username: displayName,
          rankName,
          rarityKey,
          rarityLabel,
          pokemons: bounty.pokemons,
          startLabel,
          endLabel,
          durationLabel,
          note: bounty.notes,
          rewardLabel,
          avatarUrl
        });

        await bountyChannel.send({
          files: [{ attachment: buffer, name: 'bounty-card.png' }]
        });
      } catch (err) {
        console.error('Error posting active bounty card:', err);
      }
    }
  }
};