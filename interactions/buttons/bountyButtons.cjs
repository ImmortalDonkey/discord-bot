// interactions/buttons/bountyButtons.cjs
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

const { createBountyCard } = require("../../renderers/cardRenderer.cjs");
const db = require("../../database.cjs");
const { getRankName } = require("../../utils/rankSystem.cjs");
const {
  getHighestRarityForList,
  getRarityDisplayLabel,
} = require("../../utils/rarity.cjs");

module.exports = {
  // These prefix IDs match the buttons created in bountyrequest.cjs
  ids: ["approvebounty_", "denybounty_", "claimbounty_"],

  async execute(client, interaction) {
    const id = interaction.customId;

    // --------------------------------------------------------------------
    // 1. APPROVE BOUNTY
    // --------------------------------------------------------------------
    if (id.startsWith("approvebounty_")) {
      const bountyId = id.replace("approvebounty_", "");
      const bounty = client.pendingBounties.get(bountyId);

      if (!bounty) {
        return interaction.reply({
          content:
            "❌ Could not find that bounty. It may already have been processed.",
          flags: 64,
        });
      }

      // Move to active
      client.pendingBounties.delete(bountyId);
      client.activeBounties.set(bountyId, bounty);

      const requesterId = bounty.requesterId;

      // --- Get member + nickname ---
      let member = null;
      try {
        member = await interaction.guild.members.fetch(requesterId);
      } catch (_) {
        member = null;
      }

      const displayName =
        member?.displayName || bounty.requesterName || "Unknown Trainer";

      // --- Avatar URL ---
      let avatarUrl;
      try {
        const user = member?.user || (await client.users.fetch(requesterId));
        avatarUrl = user.displayAvatarURL({
          size: 512,
          extension: "png",
        });
      } catch (_) {
        avatarUrl = interaction.client.user.displayAvatarURL({
          size: 512,
          extension: "png",
        });
      }

      // --- Rank from lifetime points in DB ---
      let lifetime = 0;
      try {
        const row = await db.getUserById(requesterId);
        lifetime = row?.lifetime_points || 0;
      } catch (_) {
        lifetime = 0;
      }
      const rankName = getRankName(lifetime);

      // --- Rarity info for this bounty ---
      const rarityKey = getHighestRarityForList(bounty.pokemons);
      const rarityLabel = getRarityDisplayLabel(rarityKey);

      // --- Text labels used on the card ---
      const startLabel = bounty.startsNow
        ? "Starts Immediately"
        : bounty.startTime.toLocaleString("en-GB", {
            dateStyle: "medium",
            timeStyle: "short",
          });

      const endLabel = bounty.endTime.toLocaleString("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
      });

      const durationLabel = `${bounty.durationHours} hour(s)`;
      const rewardLabel = `${bounty.reward.toLocaleString()} PKD`;
      const note = bounty.notes || "Good luck!";

      // --- Render the PNG card ---
      const cardPath = await createBountyCard({
        bountyId: bounty.id,
        username: displayName,
        rankName,
        rarityKey,
        rarityLabel,
        pokemons: bounty.pokemons,
        startLabel,
        endLabel,
        durationLabel,
        note,
        rewardLabel,
        avatarUrl,
      });

      // --- Build Claim button row ---
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`claimbounty_${bountyId}`)
          .setLabel("Claim Bounty")
          .setStyle(ButtonStyle.Success)
      );

      // Tell staff in the request channel
      await interaction.reply({
        content: "📢 **Bounty approved and posted to the bounty channel.**",
      });

      // Send card to bounty channel
      const channelId = process.env.BOUNTY_CHANNEL_ID;
      const channel = channelId
        ? interaction.guild.channels.cache.get(channelId)
        : null;

      if (!channel) {
        return interaction.followUp({
          content:
            "⚠ Bounty approved but `BOUNTY_CHANNEL_ID` is not configured or channel not found.",
        });
      }

      const sent = await channel.send({
        files: [{ attachment: cardPath, name: "bounty-card.png" }],
        components: [row],
      });

      // Store message + channel on the bounty for future edits (e.g. completion)
      bounty.channelId = sent.channel.id;
      bounty.messageId = sent.id;
      client.activeBounties.set(bountyId, bounty);

      return;
    }

    // --------------------------------------------------------------------
    // 2. DENY BOUNTY
    // --------------------------------------------------------------------
    if (id.startsWith("denybounty_")) {
      const bountyId = id.replace("denybounty_", "");
      const bounty = client.pendingBounties.get(bountyId);

      if (!bounty) {
        return interaction.reply({
          content: "❌ Could not find that bounty.",
          flags: 64,
        });
      }

      client.pendingBounties.delete(bountyId);

      return interaction.reply({
        content: "❌ Bounty denied.",
      });
    }

    // --------------------------------------------------------------------
    // 3. CLAIM BOUNTY  (simple placeholder for now)
    // --------------------------------------------------------------------
    if (id.startsWith("claimbounty_")) {
      const bountyId = id.replace("claimbounty_", "");
      const bounty = client.activeBounties.get(bountyId);

      if (!bounty) {
        return interaction.reply({
          content: "❌ This bounty is no longer active.",
          flags: 64,
        });
      }

      const userId = interaction.user.id;

      if (!client.bountyClaims.has(bountyId)) {
        client.bountyClaims.set(bountyId, new Set());
      }

      const claimSet = client.bountyClaims.get(bountyId);

      if (claimSet.has(userId)) {
        return interaction.reply({
          content: "⚠ You have already claimed this bounty.",
          flags: 64,
        });
      }

      claimSet.add(userId);

      return interaction.reply({
        content: "📝 Claim registered! (full claim-thread flow coming next)",
        flags: 64,
      });
    }
  },
};