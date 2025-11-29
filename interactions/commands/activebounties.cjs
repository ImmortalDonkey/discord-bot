// interactions/commands/activebounties.cjs
const { SlashCommandBuilder } = require('discord.js');

const db = require('../../database.cjs');
const { getRankName } = require('../../utils/rankSystem.cjs');
const {
  getHighestRarityForList,
  getRarityDisplayLabel
} = require('../../utils/rarity.cjs');

const { createBountyCard } = require('../../renderers/cardRenderer.cjs');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('activebounties')
    .setDescription('Show all currently active bounties as cards (staff only)'),

  async execute(client, interaction) {
    // Optional: basic staff check using STAFF_ROLES
    const staffRolesEnv = process.env.STAFF_ROLES || '';
    const staffRoleIds = staffRolesEnv
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    if (
      staffRoleIds.length &&
      !interaction.member.roles.cache.some(r => staffRoleIds.includes(r.id))
    ) {
      return interaction.reply({
        content: '🚫 Only staff can view all active bounties.',
        ephemeral: true
      });
    }

    const active = client.activeBounties || new Map();

    if (!active.size) {
      return interaction.reply({
        content: '📭 There are no active bounties right now.',
        ephemeral: true
      });
    }

    await interaction.deferReply(); // public

    await interaction.editReply(
      `📜 Listing **${active.size}** active bounty/bounties...`
    );

    const channel = interaction.channel;

    for (const bounty of active.values()) {
      try {
        // Fetch member to get nickname + avatar
        let member = null;
        try {
          member = await interaction.guild.members.fetch(bounty.requesterId);
        } catch {
          member = null;
        }

        const displayName =
          member?.displayName || bounty.requesterName || 'Unknown Trainer';

        const avatarUrl =
          member?.displayAvatarURL({ extension: 'png', size: 512 }) ||
          interaction.client.user.displayAvatarURL({
            extension: 'png',
            size: 512
          });

        // Rank from DB (lifetime_points)
        const row = await db.getUserById(bounty.requesterId);
        const lifetime = row?.lifetime_points || 0;
        const rankName = getRankName(lifetime);

        // Rarity
        const rarityKey =
          bounty.rarityKey || getHighestRarityForList(bounty.pokemons || []);
        const rarityLabel =
          bounty.rarityLabel || getRarityDisplayLabel(rarityKey);

        // Labels for times
        const start = bounty.startTime
          ? new Date(bounty.startTime)
          : new Date();
        const end = bounty.endTime ? new Date(bounty.endTime) : null;

        const fmt = (d) =>
          d.toLocaleString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });

        const startLabel = bounty.startsNow ? 'Starts Immediately' : fmt(start);
        const endLabel = end ? fmt(end) : 'Unknown';

        const durationLabel = `${bounty.durationHours || 1} hour(s)`;
        const rewardLabel = `${(bounty.reward || 0).toLocaleString()} PKD`;

        const note = bounty.notes || 'Good luck!';
        const pokemons = bounty.pokemons || [];

        // Build card
        const filePath = await createBountyCard({
          bountyId: bounty.id,
          username: displayName,
          rankName,
          rarityKey,
          rarityLabel,
          pokemons,
          startLabel,
          endLabel,
          durationLabel,
          note,
          rewardLabel,
          avatarUrl
        });

        await channel.send({
          content: `🎯 **Active Bounty** — ID: \`${bounty.id}\``,
          files: [{ attachment: filePath, name: `bounty_${bounty.id}.png` }]
        });
      } catch (err) {
        console.error('Error rendering active bounty card:', err);
      }
    }
  }
};