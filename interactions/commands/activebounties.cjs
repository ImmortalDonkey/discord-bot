// interactions/commands/activebounties.cjs
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const db = require('../../database.cjs');
const { getRankName } = require('../../utils/rankSystem.cjs');
const { createBountyCard } = require('../../renderers/cardRenderer.cjs');

function formatUk(ms) {
  return new Date(ms).toLocaleString('en-GB', {
    timeZone: 'Europe/London',
    hour12: false
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('activebounties')
    .setDescription('List all currently active bounties with cards')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(client, interaction) {
    const all = Array.from(client.activeBounties.values() || []);
    const now = Date.now();
    const active = all.filter(b => now >= b.startTime && now <= b.endTime);

    if (!active.length) {
      return interaction.reply({
        content: '📭 There are no active bounties right now.',
        ephemeral: true
      });
    }

    await interaction.reply({
      content: `📜 Posting ${active.length} active bounty card(s) in this channel...`,
      ephemeral: true
    });

    for (const bounty of active) {
      const member = await interaction.guild.members
        .fetch(bounty.requesterId)
        .catch(() => null);

      const displayName =
        member?.nickname ||
        member?.user?.globalName ||
        member?.user?.username ||
        bounty.requesterName ||
        'Unknown Trainer';

      const avatarUrl =
        member?.displayAvatarURL({ size: 512, extension: 'png' }) ||
        interaction.client.user.displayAvatarURL({
          size: 512,
          extension: 'png'
        });

      let rankName = 'Rookie Trainer';
      try {
        const row = await db.getUserById(bounty.requesterId);
        if (row) rankName = getRankName(row.lifetime_points || 0);
      } catch {
        // ignore
      }

      const startLabel = bounty.startsNow
        ? 'Starts Immediately'
        : formatUk(bounty.startTime);
      const endLabel = formatUk(bounty.endTime);
      const durationLabel = `${bounty.durationHours} hour(s)`;

      const cardPath = await createBountyCard({
        bountyId: bounty.id,
        username: displayName,
        rankName,
        rarityKey: bounty.rarityKey,
        rarityLabel: bounty.rarityLabel,
        pokemons: bounty.pokemons,
        startLabel,
        endLabel,
        durationLabel,
        note: bounty.notes,
        rewardLabel: `${bounty.reward.toLocaleString()} PKD`,
        avatarUrl
      });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`claimbounty_${bounty.id}`)
          .setLabel('Claim Bounty')
          .setStyle(ButtonStyle.Success)
      );

      await interaction.channel.send({
        files: [{ attachment: cardPath, name: `bounty_${bounty.id}.png` }],
        components: [row]
      });
    }
  }
};